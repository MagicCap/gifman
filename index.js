// Gets the platform.
const platform = require("os").platform();

// Imports Aperture if this is macOS.
let aperture;
if (platform === "darwin") {
    aperture = require("aperture")();
} else {
    aperture = null;
}

// Defines if this is recording.
let recording = null;

// Gets the FFMpeg binary location.
const ffmpeg = require("ffmpeg-static").path;

// Imports child process stuff.
const { spawn } = require("child_process");

// Used to get the temporary directory.
const tempDir = require("temp-dir");

// Defines the UUIDv4 generator.
const uuid = require("uuid/v4");

// Requires FS Nextra for filesystem stuff.
const fsNextra = require("fs-nextra");

// Starts recording.
const start = async (fps, x, y, width, height) => {
    if (recording) {
        throw new Error("Already recording.");
    }

    if (aperture) {
        // We're on macOS! We can use the nice library by the Kap team!
        const settings = {
            fps: fps,
            cropArea: {
                x: x,
                y: y,
                width: width,
                height: height,
            },
        };
        await aperture.startRecording(settings);
        recording = true;
    } else {
        // *sighs*
        const tempFile = `${tempDir}/${uuid()}.mp4`;
        const args = ["-y", "-video_size", `${width}x${height}`, "-framerate", fps, "-f", "x11grab", "-i", `:0.0+${x},${y}`, tempFile];
        const childProcess = spawn(ffmpeg, args);
        recording = [childProcess, tempFile];
    }
}

// Stops recording, encodes the file as a GIF and returns the GIF as a buffer.
const stop = async () => {
    if (!recording) {
        throw new Error("Not recording.");
    }

    let mp4Fp;
    if (aperture) {
        // Yay!
        mp4Fp = await aperture.stopRecording();
        recording = null;
    } else {
        // Boo!
        const childProcess = recording[0];
        mp4Fp = recording[1];
        recording = null;

        await new Promise(res => {
            childProcess.on("close", code => {
                if (code !== 0) {
                    throw new Error("Recording failed.");
                }
                res();
            });

            childProcess.stdin.setEncoding("utf-8");
            childProcess.stdin.write("q");
        });
    }

    // We now have a MP4 file path. Time to turn it into a GIF!
    const tempFile = `${tempDir}/${uuid()}.gif`;

    const ffmpegProcess = spawn(
        ffmpeg, [
            "-i", mp4Fp, tempFile
        ],
    );

    await new Promise(res => {
        ffmpegProcess.on("close", code => {
            if (code !== 0) {
                throw new Error("GIF encoding failed.");
            }
            res();
        });
    });

    await fsNextra.unlink(mp4Fp);
    const buffer = await fsNextra.readFile(tempFile);
    await fsNextra.unlink(tempFile);
    return buffer;
}

// Exports start and stop.
module.exports = {start, stop};
