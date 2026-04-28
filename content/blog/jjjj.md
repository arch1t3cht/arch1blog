---
title: "jjjj"
description: Taking jjj to the next level
date: 2026-04-28
tags: meme
---

I saw a blog post about a [jujutsu](https://www.jj-vcs.dev/) wrapper called [`jjj`](https://oppi.li/posts/jjj/) (for *jujutsu jump*) today,
and I figured that we couldn't just stop there.
After all, what if you want to run `jjj` on multiple revisions at once?

Introducing `jjjj` (*jujutsu jump jobs*):
```bash
#!/bin/bash

cmd="${1:-show}"

selected=$(
  jj log -r 'all()' --color=always \
    | fzf \
        --min-height=15 \
        --cycle \
        --ansi \
        --multi \
        --prompt "jj $cmd> "
) || exit 0

revs=$(echo "$selected" | awk '{for(i=1;i<=NF;i++) if(length($i)>=7){print $i; next}}') #' have another quote so that the syntax highlighting recovers

# https://superuser.com/questions/284187/how-to-iterate-over-lines-in-a-variable-in-bash
while IFS= read -r r || [[ -n "$r" ]]; do
    jj "$cmd" -r "$r" "${@:2}"
done < <(printf '%s' "$revs")
```

This can be run just like `jjj`, but now you can select multiple revisions at once using the Tab key and run your `jj` command on each of them.

(By the way, I needed to replace `$@` with `${@:2}` here and in the original `jjj` script to prevent the first argument from being inserted twice.)

<span style="font-size: 0.5em; margin-top: 3em">
Please do not take this too seriously.
</span>
