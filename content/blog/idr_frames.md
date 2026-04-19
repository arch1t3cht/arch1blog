---
title: "More Falsehoods Programmers Believe About Videos: \"IDR Frames are Random Access Points\""
description: Explaining another fun (?) edge case in video coding formats
date: 2026-04-19
tags: encoding
---

The following two links should be mandatory reading/watching for anyone working with videos:

- [Falsehoods programmers believe about [video stuff]](https://haasn.dev/posts/2016-12-25-falsehoods-programmers-believe-about-[video-stuff].html) ([haasn's blog](https://haasn.dev/))
- [Derek Buitenhuis - Things Developers Believe About Video Files (Proven Wrong by User Uploads)](https://www.youtube.com/watch?v=cRSO3RtUOOk) (YouTube)

Today I'd like to talk about another edge case along these lines.
I have encountered[^encountered] it in the wild a couple of times,
and I've seen it surprise some fairly experienced developers.
In particular, some of the Common Tools handle this incorrectly in some cases.

[^encountered]: Meaning, "Someone else encountered a file breaking their source filter and sent it to me to investigate."

The traditional wisdom is something along the lines of

<center>
<em>
In H.264, IDR frames flush the decoder's state,
so it's safe to start decoding at any IDR frame.
</em>
</center>

But this is not actually true!
All an IDR picture[^picture] does is flush the *decoded picture buffer*
and prevent frames from being reordered around it
(or, more precisely: it marks the all reference pictures as "unused for reference" and resets the picture order count).
But an H.264 decoder has more state than just the decoded picture buffer!

[^picture]: From now on I'll follow H.264's terminology and use the term *picture* rather than *frame*.
A *picture* is either a frame, or a single field of a frame in an interlaced video encoded field-by-field.

An H.264 video stream is a sequence of *NAL Units* (*NAL* being short for *Network Abstraction Layer*).
The full list of NAL unit types can be found in ITU-T Rec H.264, Table 7-1, but the most important types are:

- **Sequence parameter set (SPS)**: A structure specifying the format of the coded video sequence.
    This includes data like the video's profile and level, its pixel format, the video's width and height,
    color space information, and various other values signaling which decoding capabilities the stream requires.
- **Picture parameter set (PPS)**: A structure signaling more specific information about how pictures are coded.
    This includes data like how the picture is split into slices (if any), which entropy coding mode is used,
    and the picture's initial quantization parameter.
- **Coded slice of an IDR picture**: An IDR picture, or one part (slice) of it.
    Pictures may be coded as a single slice, or split into multiple slices for e.g. better error resilience.
- **Coded slice of a non-IDR picture**: The same as above for a non-IDR picture.
- **Supplemental enhancement information (SEI)**: Additional metadata that may aid in decoding or presentation,
    but are not strictly necessary for decoding.
    These can include, among many others,
    - **Picture timing SEI**: Signaling the frame rate at the bitstream level and possibly applying frame doubling or soft pulldown via a `pic_struct` field.
    - **Recovery point SEI**: Signaling from which pictures in the middle of the stream a decoder may start decoding to produce acceptable pictures.
        Common wisdom is that these are especially important for open-GOP videos
        (i.e. videos that do not contain any IDR pictures, except possibly at the very start,
        and instead manually flush reference pictures where applicable.
        This allows them to reorder frames around their random access points,
        which results in a slight efficiency gain in exchange for causing every multimedia developer headaches.),
        but we will see in this post why they can be just as important even when IDR pictures are present.
    - **User data SEI**: Additional metadata (registered or unregistered) that encoders can freely write.
        For example, this is where x264 stores the settings it used to encode the video.[^x264sei]
    - Various SEIs with extra metadata for players, like scene information, display orientation, HDR metadata, or film grain synthesis.

[^x264sei]: A tangentially related fun fact:
    The x264 version SEI actually affects decoding in FFmpeg,
    since FFmpeg has several code paths that check what version (if any) of x264 produced a stream
    and apply special handling for bugs in old x264 versions producing slightly incorrect files.

    Most notably, before x264 version 151, x264 would output broken streams when encoding in 4:4:4 chroma,
    and FFmpeg would decode them in an equally incorrect way, resulting in a "correct" decode.
    Both FFmpeg and x264 were [fixed](https://code.FFmpeg.org/FFmpeg/FFmpeg/commit/840b41b2a643fc8f0617c0370125a19c02c6b586),
    but many broken files produced by x264 still existed in the wild,
    so FFmpeg checks the signaled x264 version and falls back to its old, "incorrect", decoding behavior when it sees an x264 version older than 151 on 4:4:4 video.

    This has the fun (?) consequence that source filters and media players always need to start by decoding a video's first frame,
    even if they intend to seek to the middle of the stream,
    since otherwise FFmpeg's decoder will not find the x264 version.

The data corresponding to a coded picture may hence contain more than one NAL unit.
The collection of NAL units corresponding to a single picture is called an *access unit*.
For example, a single packet of an H.264 track in a Matroska file, or a single sample of an H.264 track in an mp4 file,
contains one access unit.

An H.264 stream may contain more than one SPS or PPS.
Every SPS and PPS has an ID, so that there may be multiple different SPS's or PPS's present at the same time.
Every PPS references an SPS by its ID, and every slice of every picture references a PPS.
This is how an SPS and PPS is associated to every slice, which then provides the decoder with the data it needs to decode it.

Now, what does this imply for IDR pictures and random access points?
Well, it means that a decoder has to store more state across access units than just the reference picture lists (and a couple of numbers like the picture order count)!
It also has to store all parameter sets it encountered while decoding, in case a future PPS or slice references one of them.

Now, for your "typical"[^typical] H.264 file (say, output by x264 with default settings), this is not a problem.
The NAL units of such a file will typically look as follows (assuming, for now, a *raw* H.264 bytestream, and not a track muxed into some container file):
```
Access unit  1: SPS, PPS, x264 version SEI, IDR slice
Access unit  2: non-IDR slice
Access unit  3: non-IDR slice
[...]
Access unit 24: non-IDR slice
Access unit 25: SPS, PPS, IDR slice
Access unit 26: non-IDR slice
[...]
```
That is, there is a single SPS and a single PPS (referencing that single SPS) that is repeated before every IDR access unit.
All pictures are coded using a single slice, which references this single PPS.

[^typical]: "typical" being in quotes here because, of course, there's no such thing. A better word might be "naive".

When muxing such a stream into a container file like mp4 or mkv, the SPS and PPS will get deduplicated and instead put into the track's header
(i.e. the `stsd` box in mp4 or the `CodecPrivate` element in mkv).
A muxed file will hence look as follows:

```
Track header: SPS, PPS

Access unit  1: x264 version SEI, IDR slice
Access unit  2: non-IDR slice
Access unit  3: non-IDR slice
[...]
Access unit 24: non-IDR slice
Access unit 25: IDR slice
Access unit 26: non-IDR slice
[...]
```

Nice and simple.
The SPS and PPS are only stored once, which saves space,
and the decoder can read the parameter sets in the header (and maybe the first frame to find the x264 version) and then jump to any IDR slice and start decoding from there.
Here, all the IDR pictures are beautiful random access points.

But, of course, it's never that simple in multimedia.
There's no requirement for every IDR access unit to contain an SPS or PPS,
and it's very much possible for an SPS or PPS to change throughout the stream.

Indeed, the specification says surprisingly little about how parameter sets should be stored or ordered.
Quoting the most important parts of section 7.4.1.2.1, "Order of sequence and picture parameter set RBSPs and their activation":

> Any picture parameter set NAL unit containing the value of pic_parameter_set_id for the active picture parameter set
> RBSP for a coded picture shall have the same content as that of the active picture parameter set RBSP for the coded picture
> unless it follows the last VCL NAL unit of the coded picture and precedes the first VCL NAL unit of another coded picture.
>
> When a picture parameter set NAL unit with a particular value of pic_parameter_set_id is received, its content replaces
> the content of the previous picture parameter set NAL unit, in decoding order, with the same value of pic_parameter_set_id
> (when a previous picture parameter set NAL unit with the same value of pic_parameter_set_id was present in the
> bitstream).

and

> An activated sequence parameter set RBSP shall remain active for the entire coded video sequence.

In slightly more comprehensible English, this means:
- Only one SPS may be used (i.e. referenced in a PPS which is in turn referenced in a slice) in a coded video sequence.
  Here, a *coded video sequence* is a sequence of access units from one IDR access units up to but excluding the following IDR access unit.
- There are no contraints on which (or how many) PPS's are referenced by slices, as long as the referenced IDs exist at all.
  If I read the specification correctly, it is even allowed for different slices of the same picture to reference different PPS's.
- In general it is allowed for two different SPS's or PPS's to have the same ID, in which case the newer parameter set simply replaces the old one.
  However, for PPS's this must not happen in the *middle* of a picture (e.g. between two slices), while for SPS's it may not happen in the middle of a coded video sequence.

In particular, the following are all allowed:
- An IDR frame that is not preceded by an SPS or PPS in the same access unit
- A slice referencing a parameter set that was last signaled 10,000 frames ago
- A bunch of different PPS's all having the same ID and hence repeatedly overriding each other

With this in mind, there's no way all IDR pictures can be random access points!
When starting decoding at some IDR picture in the middle of the stream,
there is no guarantee that all the subsequently needed parameter sets are included in this IDR access unit.

In fact, a search through the specification shows that this is not all that surprising.
There is absolutely no mention of IDR access units being random access points or recovery points.
Random access and/or recovery points are only mentioned in relation to recovery point SEIs (more on those later).

---

Now, okay, we've established that some H.264 streams may be weird enough that IDR frames do not work as random access points.
But surely no such weird files actually exist in practice, right?
And if they do, that's still fine, because after remuxing we can just put all the parameter sets in the header, right?
Right?

Of course, this is multimedia, so the answer is no.
Specifically, I have seen multiple Blu-rays[^bdexamples] containing m2ts video streams where
- There are multiple different PPS's, all having the same ID of 0
- These PPS's have different initial quantization parameters
- Not every IDR frame is preceded by a PPS

[^bdexamples]: The files I (or other people asking me) have encountered were from the Blu-rays for the following shows:
    - WataMote
    - Ping Pong the Animation
    - Lord Marksman and Vanadis

    This is probably not a complete list.

If, for such a stream, you seek to one of the IDR frames not preceded by a PPS while the decoder's stored PPS with ID 0 is not the PPS with ID 0 that actually precedes this IDR frame,
the decoder uses the wrong initial quantization parameter and very bad things happen (i.e. CABAC breaks and the output is completely corrupted).
So, indeed, not all IDR frames of these (perfectly legal, as far as I can tell!) files are random access points.

This concludes discussing the "Falsehood" in the post's title, but there are still two interesting questions:
1. How can a media player or source filter[^sourcefilter] handle such a file?
2. How can such a file be "fixed" when remuxing it into a better container format like mkv?

[^sourcefilter]: By *source filter* I mean a tool (say, a library or a VapourSynth plugin) like [FFMS2](https://github.com/FFMS/ffms2) or [Bestsource](https://github.com/vapoursynth/bestsource) that,
  usually after scanning the file and creating some sort of index,
  provides an API to accurately and reliably obtain any frame in the file given its frame number.
  As we have seen, videos can be very complicated, so writing a correct and fast source filter is anywhere from very hard to impossible, depending on the formats one wants to support.

Of course, the answer to the first question will depend on the player's or source filter's architecture.
For example, bestsource can simply seek to any IDR frame it finds and try to decode from there.
If the IDR frame's packet does not contain an access unit, the decoder will get corrupted frames back which it will hence drop.
At some point the decoder will reach an IDR frame which *does* contain a PPS, and will return an intact frame to bestsource.
Bestsource can then compare the hash of this frame to the index of hashed frames it computed from a linear decode beforehand,
notice that they do not match, and hence blacklist the IDR frame it seeked to and try again from an earlier seek point.
So, like the vast majority of other files, bestsource will handle such a file completely fine.
(But, as always, this reliability comes at the cost of a much longer indexing time, and slightly slower decoding due to needing to hash every frame.)

FFMS2, on the other hand, is not so lucky.
FFMS2 does not run a full decode when indexing the file, and instead only demuxes and parses every packet[^parse].
As such, it has no way of knowing which IDR frames contain parameter sets and which don't.
In theory, it could inspect the timestamps of the `AVFrame`s the decoder spits out and try to guess at whether or not it dropped any packets,
but this sounds quite brittle and may be hard to distinguish from frames being (correctly) dropped around non-IDR recovery points in open-GOP videos.

Similarly, media players usually do not do any initial indexing at all, so they will have the same problems FFMS2 does.
And, indeed, opening such an m2ts file in mpv results in corrupted output on some seeks.

[^parse]: *Parsing* here means using FFmpeg's `av_parser_parse2` to get some additional metadata about every packet, *not* manually parsing every packet of every format itself.

And, really, the conceptual issue here lies not in FFMS2 or mpv, but in FFmpeg itself.
Indeed, the video streams in question do in fact contain recovery point SEI messages that correctly signal which IDR frames are actual random access points.
So a hypothetical ideal source filter could scan the file for such SEI messages while indexing, and then use the corresponding packets as seek points.
But, unfortunately, FFmpeg simply marks every IDR frame in H.264 as a keyframe and offers no way to tell whether a keyframe flag came from a recovery point SEI or from the packet containing an IDR slice.

As such, one could argue that FFmpeg precisely falls for the Falsehood discussed here.
But making FFmpeg not mark IDR frames as keyframes is probably not an option either, since H.264 streams are in no way required to contain recovery point SEIs
(and, indeed, closed-GOP x264 encodes do not contain any by default).
So the presence recovery point SEIs would have to be communicated to the FFmpeg user in some other way, and I'm not yet sure what the best method for that would be.

The second question is also tricky.
If all the different PPS's had different IDs, they could simply all be included in the file's header,
but since they all have the ID 0, this is not possible.
As far as I can see, there are three options:

1. Patch the bitstream to give all of these parameter sets different IDs and update the references to the parameter sets accordingly,
   then add all the parameter sets in the header.
2. Not mark IDR access units that do not contain the required parameter sets as keyframes in the resulting container.

   This would result in a "correct" file, but it wouldn't actually help source FFmpeg-based filters and players:
   When demuxing a file, ffmpeg will also parse the resulting packets and update its flags accordingly.
   With its current behavior, when it sees an H.264 packet containing an IDR slice, it will set the packet's `AV_PKT_FLAG_KEY`,
   even if the packet was not marked as a keyframe in the container.
3. Insert additional copies of the parameter sets to ensure that every IDR access unit contains the parameter sets it needs.

The third option is the one that mkvtoolnix uses.
Hence, if you encounter such a file, you can remux it using mkvtoolnix to "fix" it
(that is, make it easier for players and source filters to seek accurately inside it).
In fact, if you really want to, you could even mux the video back to an m2ts afterwards.
But you really shouldn't.

FFmpeg and MakeMKV, on the other hand, do not do any special handling for this at all[^bugreport] when remuxing.
As such, remuxing such an m2ts file with one of these tools will result in an mkv file that has packets marked as keyframes that are not actually random access points.
Now, as with many other things, the Matroska specification is not really clear about what a "keyframe" actually *is*, but the general convention does seem to be "random access point"
(and, following the battle-tested strategy of "when in doubt, just copy MP4," the probably-equivalent MP4 feature would be the `stss` box, which *does* explicitly specify keyframes to be "random access points.").
So one could consider these produced files to be "broken."

[^bugreport]: And while writing this I now realize that I never made an actual bug report about this to either of those two programs, and now I feel bad.
    I do generally make an effort to report all the bugs I find, since I do very much dislike the practice of complaining about bugs on random discord servers without ever reporting them,
    but sometimes I still forget - especially when it's a bug that doesn't affect me personally and that I just found because someone asked me why their video file is broken.
    I'll see if I can make a bug report soon, I guess.
    At the very least, it's hopefully clear that I am writing about this because it's an interesting and educational story, not because I want to complain about any of these tools.

Unfortunately, it doesn't seem possible to fix an existing "broken" mkv file with a direct mkvtoolnix remux.
Instead, the video needs to be demuxed and muxed from scratch again,
which results in additional headaches when the video track has other metadata (frame rates, DAR, track flags, etc) that may get lost during a demux and remux.

In conclusion, video is hard and everything is broken. What's new.


If I got anything about this wrong, please comment and let me know.

---

*Update, two hours later*: Ridley points out that FFmpeg does actually have a bitstream filter [h264_redundant_pps](https://ffmpeg.org/ffmpeg-all.html#h264_005fredundant_005fpps)
that is designed to fix precisely the sort of Blu-ray streams described above.
(I know for a fact that I looked for FFmpeg BSFs to fix these streams back when I initially investigated this,
but I must have missed this one or forgotten about it.)

Hence, you can fix such a file using e.g. `ffmpeg -i foo.mkv -c copy -bsf:v h264_redundant_pps out.mkv`,
give or take some extra `-map` arguments to actually copy all streams.

Specifically, this filter will set the `pic_init_qp_minus26` of every PPS to 0 (and `weighted_pred_flag` to 1)
and adjust the `slice_qp_delta` of all slices to match.
This is enough to make all the differing PPS's of these types of Blu-ray streams agree, but of course it may not work for a general file.

And, in fact, the plot thickens further:
There's also the `h264_mp4toannexb` bitstream filter, which, similarly to mkvtoolnix, will insert copies of the parameter sets before every IDR frame.
(Naturally, this is in no way mentiond in the documentation, which is why I only now found out about it.)
Moreover, this BSF is automatically inserted when outputting an m2ts or raw h264 file with ffmpeg.
And, indeed, I can verify that, after a command like `ffmpeg -i foo.m2ts -c copy bar.m2ts`, all IDR access units contain parameter sets.

...Except that the resulting files still somehow corrupt when decoding.
They seem *better* than before - in particular mpv no longer *shows* corrupted frames, it just skips some - but ffmpeg still logs decoding errors and source filters still output corrupted frames.
I don't yet understand why these files are still broken, but I'll go to bed for today.
See you tomorrow, maybe.
