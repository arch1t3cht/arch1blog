---
title: "Why Unsigned Integers in C/C++ are Evil"
description: A hopefully comprehensive post listing all the arguments against using unsigned integers for nonnegative numerical values in C/C++, as well as giving practical alternatives
date: 2026-10-10
tags: c++
---

In C and C++, `unsigned` should *not* be used to indicate that a variable will never be negative.

This is in no way any sort of new revolutionary insight.
This guideline is included in several big style guides and best practice documents,
such as the [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#res-nonnegative)
and [Google's C++ style guide](https://google.github.io/styleguide/cppguide.html#Integer_Types).
See [below](#sources-and-prior-discussion) for a longer list of sources.

However, the various arguments for this are spread across a couple of different sites.
Moreover, I haven't yet found an article that gives concrete advice on what to use *instead* in the various use cases.
That's why I ended up writing this blog post, which tries to collect all of the arguments against unsigned integer types
and gives guidelines on what to use instead.
I claim no originality for most of these points; I am purely collecting what I read in various previous sources.

## The Main Argument

I think that the best place to start the case against unsigned integers is to address the main reason
why one might be led to use unsigned integers for nonnegative numbers in the first place.
After all, it's a fairly natural instinct.
The reasoning usually goes as follows:

1. Unsigned integers can never be negative.
2. I have a variable containing a number (say, a size, or a count of something) that I know should never be negative.
3. It is good practice to encode invariants of a program in the language's type system (or, in other words, to make illegal states inexpressible).
4. Hence, I should make my variable unsigned.

However, the flaw in this line of argument is that **unsignedness is not an invariant**!
Or, more precisely, while `x >= 0` is certainly always true, and hence, in a sense, "invariant", for an `unsigned int x`,
making `x` unsigned does nothing to make invalid states inexpressible.
The code `unsigned int x = -1;` is perfectly legal both at compile time (i.e. such a line of code will not result in a compiler error or warning)
and at runtime (i.e. assigning a negative value to an unsigned integer or underflowing it with an arithmetic operation is perfectly defined behavior).

This is the most important point in this post, so it has to be repeated once again to stress it:
**Marking a variable as unsigned does *nothing* to prevent it from being assigned negative values.**
Yes, any value you read *out* of an unsigned integer will be nonnegative, but it is perfectly possible for this nonnegative value to be some garbage value that arose due to having underflowed or having been assigned a negative value.

### Recontextualizing `unsigned`

When I was first learning about this, I had some difficulties with getting myself to understand this point *intuitively*.
Sure, this argument makes logical sense, but getting past years of hearing "unsigned ensures a value is never negative" was surprisingly hard.
For that, it helped me to think a little about what the term "unsigned" *actually* means.
After all, it's `unsigned int` and not `nonnegative int`.
And what "unsigned" really means, literally speaking, is "no sign bit."
That is, it means that this value has *no* signedness information at all, positive *or* negative.
The answer to what sign an unsigned integer has (in C/C++) should not be "it's nonnegative"; the real answer is that the question itself is ill-formed.

I'm not sure how much it will help others, but thinking about `unsigned` in this way helped me get around my old (incorrect) intuition a bit.

## Concrete Arguments against `unsigned`

Now, the previous section explained how `unsigned` does not actually have the advantages that many people think it does,
but it has not yet shown any actual downsides of using `unsigned`.
These will be listed in this section.

### Harder to Validate

Let's say you have a function `void f(int x)`, that expects its argument `x` to always be nonnegative.
We've already established that making the argument an `unsigned int` does not help with preventing `f` from being called with negative numbers,
but why shouldn't we make `f` take an `unsigned int` anyway, purely to signal the precondition that the argument should be nonnegative?

One simple argument is that validating the correctness of the argument becomes trickier.
If `f` takes an `int x`, you can simply `assert(x >= 0)` (or something comparable) at the beginning of the function.
But if `f` takes an `unsigned int x`, how can you tell whether a negative integer was passed?
Do you just pick some arbitrary cutoff value like `assert(x <= INT_MAX)`?
That is far less idiomatic.
If your function expects its argument to have a certain signedness, it's better for the type of that argument to be one that can meaningfully encode that signedness.

### Error-prone

This is the most common argument against unsigned integers.
The wrapping behavior of unsigned underflows can make for unexpected results that can easily lead to bugs when the developer is not extremely careful.

There are two classical examples illustrating this:

1. Iterating over a container in reverse.
    The naive way to do this would be the following:

    ```cpp
    for (size_t i = mycontainer.size() - 1; i >= 0; i--) {
        // Do something with mycontainer[i]...
    }
    ```

    However, if `i` is of an unsigned type like `size_t`, then the loop condition `i >= 0` will always be true!
    So this will be an infinite loop.

    There are a couple of ways to get around this, like offsetting `i` by one or replacing the `i >= 0` condition with `i != SIZE_MAX` or `i != (size_t) -1`,
    but they are all less idiomatic and require greater care[^views].
    Simply making `i` signed, on the other hand, trivially avoids this issue.
2. Iterating until the second-to-last element.
    Consider a function like the following:

    ```cpp
    bool has_repeated_values(const MyContainer &mycontainer) {
        for (size_t i = 0; i <= mycontainer.size() - 1; i++) {
            if (mycontainer[i] == mycontainer[i + 1]) {
                return true;
            }
        }
        return false;
    }
    ```

    Here, the issue is the case where `mycontainer` is empty.
    In that case, the `mycontainer.size() - 1` computation underflows to `SIZE_MAX`, causing the loop to go far past the bounds of `mycontainer`.

    Of course, an additional check could be added for this special case, but once again, this issue can be trivially sidestepped by turning `i` into a signed type and casting `mycontainer.size()` to signed.

    Let me stress that, on its own, the unsigned underflow in `mycontainer.size() - 1` is perfectly legal as far as the C/C++ standard is concerned:
    This is in no way undefined behavior, or even unspecified behavior.
    This is one of the main reasons why unsigned integer arithmetic can be so treacherous in C/C++.

[^views]: Except of course higher level abstractions like `std::views::reverse`, but that does not change the point that unsigned integers are bug-prone.

### Preventing Optimizations

The fact that *signed* overflow and underflow is undefined behavior in C/C++ means that compilers can, e.g.,
assume that `x + 1 >= x` is always `true` if `x` is signed, which can aid in optimizing code.
Unsigned integers, on the other hand, do not allow any such assumptions, so compilers will not be able to optimize unsigned integer arithmetic as much.

Granted, there is plenty of debate about whether or not signed integer overflows being UB (as opposed to, say, an error in debug builds and wrapping in release builds) is really a good idea or not,
but it's a meaningful difference to unsigned integer overflows, so I am listing it here.

## Addressing Counterarguments

There are a couple of reasons why one might be led to still prefer unsigned integers over signed integers despite the arguments listed above.
I will respond to these here.

### But Signed Integers are Wasting a Bit

It's true that, for a number that is expected to always be nonnegative, an unsigned integer of a given length allows for twice the range of a signed integer.
This can make it feel wasteful to use signed integers to hold an always-nonnegative value.
That was certainly the case for me when researching this, and it took quite a while for me to get rid of that instinct.

However, in practice, are there really cases where you *really* need that one extra bit?
There are roughly two types of situations where you need to deal with integers:

1. When doing some sort of arithmetic computations.
    In this case, if losing that one extra bit makes you risk an integer overflow, are you really sure that your unsigned integer type is itself large enough?
    I'd argue that, in this case, it is usually better to just use a bigger signed integer type to be on the safe side.
2. When working with indices or container sizes.
    Here, for the signed version of `size_t` to not be enough, you would have to be working with a data structure that is larger than half of your memory address space.
    On x86_64, this is simply impossible.
    The only case where this is in any way realistic is in some extreme embedded scenario, in which case you're on your own anyway.

Thus, while it's natural to feel reluctant to "waste" that one extra bit, I would claim that this only very rarely makes an actual difference in practice.

### But I want to Signal my Nonnegativity Condition

We've already discussed the various problems of using `unsigned` for this.
Still, one additional point I'd like to mention is that `unsigned` also feels a bit "arbitrary" here.
After all, there are plenty of other invariants that one might want to signal for numerical values, like "always nonzero", "always negative", "always between 0 and 1000", and so on.
`unsigned` is the only one of these that could theoretically be signaled at a level of standard integer types.
Granted, "always nonnegative" is one of the most common invariants, but even so, one can argue that this might simply be the wrong layer to signal this invariant at.

There are plenty of other ways to signal invariants, like doc comments, assertions, or everyone's favorite uncontroversial C++26 feature called contracts.
Those all have their own benefits and drawbacks, but at least these ways of signaling nonnegativity would be consistent with all other invariants.

If you *must* signal nonnegativity on a type level, you can always define your own `nonnegative_int` type:
Either just as a simple renaming with `using nonnegative_int = int` that is in no way enforced at compile-time or runtime (very similarly to how `unsigned` works for this),
or as a custom struct with constructors doing actual runtime checks.

### But the Standard Library uses Unsigned Integers for its Size Types

Indeed, it does.
It's wrong.

This may sound like some big controversial claim, but this is actually something that many C++ experts, including Bjarne Stroustrup, agree on, for the exact reasons listed above. (See [below](#sources-and-prior-discussion) for sources and details.)
If the STL was designed from scratch today, it would probably use signed integers for its size types.
(But if we were to redesign C++ from scratch, we'd probably also just make unsigned integer overflow an error... and implement better copy/move semantics... and proper algebraic data types... and more powerful type deduction. Somebody should make a language like that. They could call it Corrosion, or something.)

But we're stuck with the STL we have, so we'll have to live with its size types being unsigned.
In my opinion, the best way to handle this, is to just use signed integers everywhere internally, and only convert to/from unsigned directly before/after STL calls.
I'll explain the best way to do this in the next section.

### But Signed Overflow is Undefined Behavior

More precisely, this argument might go as follows:

> Signed integer overflows and underflows are undefined behavior in C/C++,
> so if a signed integer computation overflows or underflows, your program might blow up unpredictably.
> With unsigned integers, you still get some predictable result.

While there is certainly a debate to be had about whether signed integer overflow should really be *undefined* behavior,
as opposed to something predictable but erroneous[^erroneous].
This is simply not a reason to prefer unsigned over signed.
When an integer (signed or not) overflows or underflows in a scenario where this was not expected by the programmer,
the program is broken either way.
Even if the overflow itself was defined, the resulting value would be something unexpected, invariants will be broken,
and the error will propagate further through the program (possibly eventually causing undefined behavior elsewhere).
If my program has a bug due to overflowing integers, I would prefer that bug to surface right at the source
(where it could e.g. be caught by tooling like UBSan) rather than hundreds of lines later in some seemingly unrelated location.

[^erroneous]: Maybe C++26's [erroneous behavior](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p2795r5.html) will also be extended to signed integer overflows eventually.

In other words, it is certainly true that signed integer arithmetic can have dangerous pitfalls due to overflows,
but this is just as true for unsigned integers!
How to safely perform integer arithmetic, especially with untrusted inputs, is a very significant question,
but my claim is that it is simply orthogonal to the signed vs. unsigned debate.

### But Checking for Overflows is Harder with Signed Integers

I saw this argument in a post called "[Almost Always Unsigned](https://graphitemaster.github.io/aau/#your-counter-arguments-are-about-pathological-inputs)"[^aau]
that I found while researching this subject.
That post writes the following:

[^aau]: Needless to say, I believe that this post is simply *completely* wrong, for all of the reasons described above.
I initially intended my post to contain a more fine-grained section-by-section rebuttal of it,
but in the end decided to present the arguments in a more structured way for a hopefully better exposition.
Still, I couldn't resist explicitly calling out that post at least once.

> For a fun laugh, this is the only correct way (that I know of) to detect for signed integer overflow and underflow in standard C or C++.
>
> ```cpp
> if ((b > 0 && a > INT_MAX - b) || (b < 0 && a < INT_MIN - b)) // addition overflows
> if ((b > 0 && a < INT_MIN + b) || (b < 0 && a > INT_MAX + b)) // subtraction underflows
> ```
> Good luck remembering and typing these monstrosities when you need it.

I believe that that line of argument is simply insane.
It's the 21st century; we don't need to type every reusable snippet of code from memory every time we need to use it.
We can write a function like `checked_add` once and use it everywhere we need.
This also has the benefit of being more readable and more explicit about the respective intent.

C23 and C++26 even have the [`ckd_add`/`ckd_sub`/`ckd_mul`](https://en.cppreference.com/cpp/header/stdckdint.h) family of functions
that can do this more efficiently (which you can write your own convenience wrappers for, if needed); see below.

## Recommendations

This is really the main reason why I set out to write this post.
There are a couple of linkable sources on why to avoid unsigned integers, but not too many on what exactly to use instead.
I'll go through the relevant cases one by one.

If you disagree with any of these recommendations, do let me know.
I am very interested in more discussion on this.

### What Integer Type to Use

I think Bjarne Stroustrup himself put it best (full quote [below](#sources-and-prior-discussion)):

> Use `int`s until you have a reason not to.
> Don't use unsigned unless you are fiddling with bit patterns
> and never mix signed and unsigned.

But if you need a more concrete set of guidelines, I've been sticking to the following:

- If I am storing some generic number, use `int`.
  Here, "generic number" means:
    - It is counting something (as opposed to being a `char` or some generic chunk of data that should go in a `std::byte`).
    - It is not likely to ever get close to `INT_MAX`.
    - None of the clauses below apply.
- If my number has a realistic chance of going above `INT_MAX`, use `int64_t`.
- If my number occurs in a large number of instances in a performance-critical context,
  use the smallest (signed!) integer type that can represent all values (but beware of premature optimization).
- Only ever use unsigned integers in one of the following cases:
    - When using bit flags or parsing/writing bitwise formats.
    - When I very explicitly need mod-power-of-two arithmetic and do not plan on ever comparing two of these numbers.
    - On some highly specialized hardware architectures where the extra sign bit really does make a meaningful difference.
    - When implementing low-level primitives for safe signed arithmetic.
- When interacting with libraries (including the STL) that take or return unsigned integers, convert them at the boundary.

The one remaining question is what to use for container lengths and sizes.
The old-school advice here is to use `size_t`, but that is an unsigned type and hence Evil.
There are a couple of alternative options:

1. `std::make_signed_t<size_t>` seems like the most natural alternative.
   Its main problem is that it is far too verbose to type, and having every C++ project define its own shorthand for it sounds like a mess.
   It's also only available in C++, and not in C.
1. `ptrdiff_t` exists in both C and C++ and is [designed](https://timsong-cpp.github.io/cppwp/n4950/support.types.layout#2) to hold the difference between two array subscripts.
   It is also what `std::ssize` usually returns.
   Now, there is [no guarantee](https://timsong-cpp.github.io/cppwp/n4950/expr.add#note-2) that the type is actually *large enough* to hold all possible such differences,
   and there is also no requirement that `ptrdiff_t` have the same size as `size_t`, but I believe it should match `std::make_signed_t<size_t>` on all sane platforms.
1. The C++ core guidelines [recommend](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#res-subscripts) `gsl::index` for subscripts.
   In [Microsoft's implementation](https://github.com/microsoft/GSL/blob/a22ab8a4d16db1095a15234907f6cddcc7be8280/include/gsl/util#L103-L104) of the GSL,
   that type is defined as `ptrdiff_t`.

Since I don't want to pull in an external library just for a sane signed size type, I think that `ptrdiff_t` fits best here.
Maybe one day C++ will get an `std::ssize_t`[^ssize_t] so that there is a single blessed answer, but until then, `ptrdiff_t` works well enough.

[^ssize_t]: Note that POSIX does [define](https://pubs.opengroup.org/onlinepubs/009696799/basedefs/sys/types.h.html) a type `ssize_t`, but this is not part of the C or C++ standards. Moreover, this definition of `ssize_t` is only required to be able to store values in the range `[-1, SSIZE_MAX]` (i.e. a size or an error code) as opposed to general differences of subscripts.

### How to do Safe Arithmetic

There are two main approaches here:

1. Enforce bounds on all inputs at the start of your algorithm to ensure that none of the computations will ever overflow.
1. Check each individual arithmetic operation for overflows at runtime.

Usually these two approaches are mixed in some way depending on the specific use case.

This is fairly standard, but the main reason why I am including a section on this is to highlight two useful bits of information:

1. C23 and C++26 added functions [`ckd_add`/`ckd_sub`/`ckd_mul`](https://en.cppreference.com/cpp/header/stdckdint.h) to efficiently do checked arithmetic.[^checked]
   There are also [backport libraries](https://github.com/jart/jtckdint) for older C/C++ versions.
1. In principle, it is possible to write C++ wrapper classes for integers that provide a similar API like Rust's integers do,
   i.e. checking for overflows on debug builds and providing functions like `.checked_add()`.

   I checked whether something like this exists already and the [SafeInt](https://github.com/dcleblanc/SafeInt/) library seems to be pretty close to this,
   though it still seems a bit tricky to use correctly (e.g. because the conversions back to raw integers happen explicitly).

   I haven't checked this library in detail, but I felt like I should at least mention it here.

[^checked]: In case you were wondering, I [checked](https://godbolt.org/z/YP37bvYrT) (heh), and it seems like compilers currently do not optimize a manual overflow test to an addition followed by a flag test, so this is indeed faster.

### How to Interact with STL Containers

The biggest annoyance when using signed integers everywhere used to be the fact that the C++ standard library uses unsigned size types,
and hence that all comparisons including `my_container.size()` would mix signed and unsigned, resulting in annoying (but very justified) compiler warnings.

In modern C++, however, there is an easy way around this:
C++20 adds [`std::ssize`](https://en.cppreference.com/cpp/iterator/size), an analogue of `std::size` that returns a signed version of the container's size.
This works on any type that supports a `.size()` method (as well as on arrays), so it can be used on both STL and third-party containers.

Hence, the solution here is to replace `mycontainer.size()` with `std::ssize(mycontainer)` everywhere.
If your container is part of the STL, you could also make use of ADL and just write `ssize(mycontainer)`, but of course this will not work for third-party containers unless they implement their own `ssize`.

## Other Languages and Other Configurations

Finally, I should stress that all of the above discussion was solely about C and C++.
In languages like Rust or Zig, unsigned integer overflows and underflows are illegal and wrapping addition needs an explicit opt-in.
Moreover, converting a negative signed integer to an unsigned integer is [always illegal in Zig](https://ziglang.org/documentation/master/#Cast-Negative-Number-to-Unsigned-Integer), whereas in Rust, it is [defined to wrap](https://doc.rust-lang.org/reference/expressions/operator-expr.html#r-expr.as.numeric.int-same-size) when using `as` but is [caught when using `.try_into()`](https://doc.rust-lang.org/stable/std/primitive.u8.html#impl-TryFrom%3Ci8%3E-for-u8).

Hence, `unsigned` is a genuine invariant in these languages (at least when using best-practice conversions in Rust),
so the main argument against unsigned integers in C/C++ does not apply for them.
One can argue that the argument about bug-proneness still applies, but the situation is far less clear-cut than it is for C and C++.

Lastly, I should also mention that there *are* some specialized setups for C and C++ that allow making unsigned overflows illegal.
In particular, Clang's [UBSan](https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html#available-checks) has the `-fsanitize=integer` family of checks
(which is *not* part of `-fsanitize=undefined`) that can check for unsigned integer overflows as well as wrapping signed-to-unsigned conversions.
However, this goes against the C/C++ standards, so it is not portable and will likely also catch many intentionally wrapping casts.

## Sources and Prior Discussion

- The [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#res-nonnegative) say,
  "Don’t try to avoid negative values by using `unsigned`."
- [Google's C++ style guide](https://google.github.io/styleguide/cppguide.html#Integer_Types) says,
  "Do not use an unsigned type merely to assert that a variable is non-negative."
- [learncpp.org](https://www.learncpp.com/cpp-tutorial/unsigned-integers-and-why-to-avoid-them/) has a page on "Unsigned integers, and why to avoid them."
- [C++ Proposal P1227](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1227r1.html) introduces `std::ssize` and gives motivation for adding it.
- [An issue on the Ranges/STL2 proposal's GitHub](https://github.com/ericniebler/stl2/issues/182) contains lots of discussion on this.
- A [2013 panel of C++ experts](https://www.youtube.com/watch?v=Puio5dly9N8) goes into this topic multiple times.

  I will reproduce the relevant excerpts as text here for the readers that cannot listen to a video.
  (Timestamps taken from [@poelmanc's comment on the STL2 issue](https://github.com/ericniebler/stl2/issues/182#issuecomment-287683189).)

  <details>
  <summary>Click to open transcript of C++ panel excerpts</summary>

  From [12:12 to 13:08](https://www.youtube.com/watch?v=Puio5dly9N8#t=12m12s):

  Chandler Carruth:
  > I'll give you a simple set of guidelines.
  > 1. Use signed integers unless you *need* two's complement arithmetic or a bit pattern.
  > 2. If you're using an integer in a common—and I mean lots of instances—or large datastructure,
  >    use the smallest integer that will suffice.
  >    Otherwise, use an int if you think that the big-O of the number of things that you have
  >    is kind of how many things you can count, like thousands and millions—maybe—then use an `int`.
  >     If the big-O of the number of things you have is something that you wouldn't want to go around counting,
  >    use a 64-bit integer.
  >    And stop worrying and use tools to catch it when you get it wrong.

  Followed by Bjarne Stroustrup:
  > Yeah, I was going to say something very similar:
  > Use `int`s until you have a reason not to.
  > Don't use unsigned unless you are fiddling with bit patterns
  > and never mix signed and unsigned.

  From [42:40 to 45:26](https://www.youtube.com/watch?v=Puio5dly9N8#t=42m40s):

  Bjarne Stroustrup:
  > Whenever you mix signed and unsigned numbers, you get trouble.
  > The rules are just very surprising, and they turn up in code in strange places that correlate very strongly with bugs.
  > Now, when people use unsigned numbers, they usually have a reason.
  > And the reason will be something like "Well, it can't be negative" or "I need an extra bit."
  > If you need an extra bit, I am very reluctant to believe you that you really need it, and I don't think that's a good reason.
  > When you think you can't have negative numbers, you will have somebody who initializes your unsigned with -2 and think they get -2, and things like that.
  > It is just highly error-prone.
  > I think one of the sad things about the standard libraries is that the indices are unsigned whereas array indices are signed
  > and you're sort of doomed to have confusion and problems with that.
  > There are far too many integer types, there are far too lenient rules for mixing them together, and it's a major bug source.
  > Which is why I'm saying, stay as simple as you can, use integers until you really, really need something else.

  Followed by Herb Sutter:
  > Use `int` until you need something different,
  > then still use something *signed* until you really need something different, then resort to unsigned.
  > And yes, it's unfortunately a mistake in the standard library that we use unsigned indices.
  >
  > If you are writing a *very large* data structure, and the only case where you would really care about the unsigned is if you *know*
  > it's an array of *characters* that's gonna be bigger than half of memory.
  > I don't know of any other case where it matters, and that is only on a 32-bit system or less, and it just *does not* come up in practice very much.

  Followed by Chandler Carruth:
  > I'd like to add one other thing.
  > Think about this:
  > How frequently have you written arithmetic and *wanted* mod-2 behavior?
  >
  > Alright? It will take you a *long* time to remember the last time you wanted 2-to-the-32 modular behavior.
  > That's really unusual. Why would you select a type which gives you that?
  > And prevents any tool from ever finding a bug because it thinks you *need* mod-2 behavior.

  From [1:02:50 to 1:03:15](https://www.youtube.com/watch?v=Puio5dly9N8#t=1h2m50s):

  Responding to a question "[...] but all the ordinals in the STL, vector size and all kinds of stuff, they're all unsigned. [...]"

  Herb Sutter:
  > They're wrong.

  Chandler Carruth:
  > We're sorry.
  >
  > As Scott would say, we were young.

  </details>
