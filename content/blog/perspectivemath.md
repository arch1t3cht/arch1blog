---
title: The Math Behind Perspective in .ass Subtitles
description: An old post explaining how perspective transformations work in ASS subtitles
date: 2022-08-11
realdate: 2026-04-15
tags: external,subtitling
---

I'll be honest, I completely forgot about this page and only rediscovered it now when going through all my old ramblings so I could link them on this blog.
I don't think anything in there is *wrong*, but it's fairly outdated at this point.
(It was written after I got Zahuczky's old Perspective-Motion script to work correctly, but before I built Aegisub's built-in perspective tool or my own improved PerspectiveMotion script.)
Still, I'll link it here for completeness.

If you're interested in the math behind the new perspective tools,
I tried my best to structure and comment the code of both [Aegisub's built-in perspective tool](https://github.com/arch1t3cht/Aegisub/blob/168b6f679db0cd3f622aa76e77fb2703e2766537/src/visual_tool_perspective.cpp#L574-L872)
and [my Perspective.moon module used in the perspective scripts](https://github.com/TypesettingTools/arch1t3cht-Aegisub-Scripts/blob/44ab7cd2fc72e52bfad96cf2b2b20284031c51d3/modules/arch/Perspective.moon#L208-L380)
as well as possible, so you should hopefully be able to read those for more insights.

Link: <https://github.com/TypesettingTools/arch1t3cht-Aegisub-Scripts/blob/main/doc/perspective_math.md>
