1. Add progress fields to Video

Your model should have something like:

{
    status: "processing",
    progress: 0
}

Eventually:

{
    status: "completed",
    progress: 100
}

I'd also add a currentStage field because a percentage alone is pretty useless.

{
    status: "processing",
    progress: 67,
    currentStage: "transcoding_720p"
}

So your document might become:

{
  "status": "processing",
  "progress": 67,
  "currentStage": "transcoding_720p"
}
2. Create a progress update function

Don't scatter MongoDB updates everywhere.

Create something like:

services/
└── videoProgress.service.js

Conceptually:

async function updateProgress(videoId, progress, stage) {
    await Video.findByIdAndUpdate(videoId, {
        progress,
        currentStage: stage
    });
}

Now your worker can simply do:

await updateProgress(videoId, 15, "metadata");
3. Put progress updates throughout the pipeline

Your Module 9 pipeline currently looks like:

Metadata
↓
Thumbnail
↓
1080p
↓
720p
↓
480p
↓
Upload
↓
Completed

Give each stage progress.

For example:

0%    queued

15%   metadata extracted

25%   thumbnail generated

45%   1080p complete

65%   720p complete

85%   480p complete

95%   outputs uploaded

100%  completed

Don't worry about these exact percentages. They're just a starting point.

4. Better: don't lie with fake precision

This is important.

If your pipeline has seven stages, don't pretend you know:

37%
38%
39%
40%

unless you actually have meaningful progress information.

For now, stage-based progress is perfectly fine:

0
15
25
45
65
85
95
100

Later, when you learn how to extract actual FFmpeg progress, you can make transcoding itself report:

45%
46%
47%
...
63%
64%

That's much more interesting.

5. Create a status endpoint

You already have:

GET /videos/:id

Make it return:

{
  "id": "123",
  "status": "processing",
  "progress": 67,
  "currentStage": "transcoding_720p"
}

Now you've got everything needed for a frontend.

6. Implement polling

This should be your main practical for the communication part of this module.

Don't build WebSockets yet.

The client does:

GET /videos/123
       ↓
67%

wait 2 seconds

GET /videos/123
       ↓
85%

wait 2 seconds

GET /videos/123
       ↓
100%

You can test this with:

Postman
a tiny HTML page
a React frontend if you really want to suffer

I'd use a tiny HTML page.

7. Build a tiny progress UI

Something ridiculously simple:

Video: vacation.mp4

████████████████░░░░░░░░ 67%

Transcoding 720p...

The browser polls:

GET /videos/:id

and updates the progress bar.

That's enough.

You don't need to turn this into a frontend engineering project.

8. Then deliberately compare the approaches

This is where your theory becomes useful.

Polling
Client ──GET──> API
Client <─67%── API

...2 seconds...

Client ──GET──> API
Client <─85%── API

Simple.

Long polling

Conceptually:

Client ───────GET──────> API

                       waits...

                       progress changes

Client <────67%──────── API

You don't need to implement this for this module.

Understand the tradeoff.

WebSockets
Client ←──────────────→ Server

       67%
       85%
       100%

Persistent two-way connection.

Again, learn it conceptually for now.

Server-Sent Events
Server ──────────────→ Client

        67%
        85%
        100%

Persistent one-way stream from server to client.

Also conceptual for now.

9. One very important experiment

Start processing a video.

Then restart the API server.

Check:

GET /videos/:id

The progress should still be there.

Why?

Because:

Progress
   ↓
MongoDB

not:

Progress
   ↓
Node.js memory

That's an important distinction.

Your API can die and come back, and the processing state remains available.

10. Another important experiment

Kill the worker halfway through.

For example:

67%
   ↓
💀 Worker dies

Then check MongoDB.

You'll probably have:

{
  "status": "processing",
  "progress": 67
}

Now you've got an interesting architectural question:

What should happen to progress when a job fails or gets retried?

That will tie together Modules 6, 7, 12 and 13.

You may decide that a retry should reset the progress:

67%
 ↓
retry
 ↓
0%

or keep the old progress but mark the attempt separately.

For this project, I'd keep it simple initially:

retry → progress resets to 0