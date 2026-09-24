/// <reference no-default-lib="true"/>
import type { FFmpegCoreModule } from "@ffmpeg/types";
interface FFmpegCoreConfig extends Partial<FFmpegCoreModule> {
    wasmURL?: string;
}
type FFmpegCoreConfigFactory = (moduleOverrides?: FFmpegCoreConfig) => Promise<FFmpegCoreModule>;
declare global {
    interface WorkerGlobalScope {
        createFFmpegCore: FFmpegCoreConfigFactory;
    }
}
export {};
