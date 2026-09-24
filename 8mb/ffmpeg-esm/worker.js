/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { FFMessageType } from "./const.js";
import { ERROR_UNKNOWN_MESSAGE_TYPE, ERROR_NOT_LOADED, ERROR_IMPORT_FAILURE, ERROR_CORE_URL_REQUIRED, } from "./errors.js";
let ffmpeg;
const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, }) => {
    const first = !ffmpeg;
    if (!_coreURL) {
        throw ERROR_CORE_URL_REQUIRED;
    }
    try {
        // when web worker type is `classic`.
        importScripts(_coreURL);
    }
    catch {
        // when web worker type is `module`.
        self.createFFmpegCore = (await import(
        /* @vite-ignore */ _coreURL)).default;
        if (!self.createFFmpegCore) {
            throw ERROR_IMPORT_FAILURE;
        }
    }
    const coreURL = _coreURL;
    const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/.js$/g, ".wasm");
    let coreBlobURL = coreURL;
    if (!coreURL.startsWith("blob:") && !coreURL.startsWith("data:")) {
        try {
            const res = await fetch(coreURL);
            const blob = await res.blob();
            coreBlobURL = URL.createObjectURL(blob.type === "text/javascript" || blob.type === "application/javascript"
                ? blob
                : new Blob([blob], { type: "text/javascript" }));
        }
        catch {
            // If fetching as blob fails, fall back to coreURL
        }
    }
    ffmpeg = await self.createFFmpegCore({
        mainScriptUrlOrBlob: coreBlobURL,
        wasmURL,
        locateFile: (path, prefix) => {
            if (path.endsWith(".wasm"))
                return wasmURL;
            if (path.endsWith(".js"))
                return coreBlobURL;
            return prefix + path;
        },
    });
    ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
    ffmpeg.setProgress((data) => self.postMessage({
        type: FFMessageType.PROGRESS,
        data,
    }));
    return first;
};
const exec = ({ args, timeout = -1 }) => {
    ffmpeg.setTimeout(timeout);
    ffmpeg.exec(...args);
    const ret = ffmpeg.ret;
    ffmpeg.reset();
    return ret;
};
const ffprobe = ({ args, timeout = -1 }) => {
    ffmpeg.setTimeout(timeout);
    ffmpeg.ffprobe(...args);
    const ret = ffmpeg.ret;
    ffmpeg.reset();
    return ret;
};
/**
 * Interrupt any running exec/ffprobe by setting the ffmpeg timeout to 1 ms.
 * This causes the WASM-side watchdog to fire almost immediately, stopping
 * the current command and returning exit-code 1 (timeout).  The exec()
 * call on the main thread has already been rejected with an AbortError by
 * the time this message arrives, so the exit-code reply is simply discarded.
 */
const cancel = () => {
    if (ffmpeg) {
        ffmpeg.setTimeout(1);
    }
};
const writeFile = ({ path, data }) => {
    ffmpeg.FS.writeFile(path, data);
    return true;
};
const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });
// TODO: check if deletion works.
const deleteFile = ({ path }) => {
    ffmpeg.FS.unlink(path);
    return true;
};
const rename = ({ oldPath, newPath }) => {
    ffmpeg.FS.rename(oldPath, newPath);
    return true;
};
// TODO: check if creation works.
const createDir = ({ path }) => {
    ffmpeg.FS.mkdir(path);
    return true;
};
const listDir = ({ path }) => {
    const names = ffmpeg.FS.readdir(path);
    const nodes = [];
    for (const name of names) {
        const stat = ffmpeg.FS.stat(`${path}/${name}`);
        const isDir = ffmpeg.FS.isDir(stat.mode);
        nodes.push({ name, isDir });
    }
    return nodes;
};
// TODO: check if deletion works.
const deleteDir = ({ path }) => {
    ffmpeg.FS.rmdir(path);
    return true;
};
const mount = ({ fsType, options, mountPoint }) => {
    const str = fsType;
    const fs = ffmpeg.FS.filesystems[str];
    if (!fs)
        return false;
    ffmpeg.FS.mount(fs, options, mountPoint);
    return true;
};
const unmount = ({ mountPoint }) => {
    ffmpeg.FS.unmount(mountPoint);
    return true;
};
self.onmessage = async ({ data: { id, type, data: _data }, }) => {
    const trans = [];
    let data;
    try {
        if (type !== FFMessageType.LOAD && !ffmpeg)
            throw ERROR_NOT_LOADED; // eslint-disable-line
        switch (type) {
            case FFMessageType.LOAD:
                data = await load(_data);
                break;
            case FFMessageType.EXEC:
                data = exec(_data);
                break;
            case FFMessageType.FFPROBE:
                data = ffprobe(_data);
                break;
            case FFMessageType.CANCEL:
                cancel();
                // CANCEL is fire-and-forget: no reply needed.
                return;
            case FFMessageType.WRITE_FILE:
                data = writeFile(_data);
                break;
            case FFMessageType.READ_FILE:
                data = readFile(_data);
                break;
            case FFMessageType.DELETE_FILE:
                data = deleteFile(_data);
                break;
            case FFMessageType.RENAME:
                data = rename(_data);
                break;
            case FFMessageType.CREATE_DIR:
                data = createDir(_data);
                break;
            case FFMessageType.LIST_DIR:
                data = listDir(_data);
                break;
            case FFMessageType.DELETE_DIR:
                data = deleteDir(_data);
                break;
            case FFMessageType.MOUNT:
                data = mount(_data);
                break;
            case FFMessageType.UNMOUNT:
                data = unmount(_data);
                break;
            default:
                throw ERROR_UNKNOWN_MESSAGE_TYPE;
        }
    }
    catch (e) {
        self.postMessage({
            id,
            type: FFMessageType.ERROR,
            data: e.toString(),
        });
        return;
    }
    if (data instanceof Uint8Array) {
        trans.push(data.buffer);
    }
    self.postMessage({ id, type, data }, trans);
};
