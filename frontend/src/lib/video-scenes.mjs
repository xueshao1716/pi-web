import { VIDEO_GRAMMARS } from "./video-grammars.mjs";
import { VIDEO_EXAMPLES } from "./video-examples.mjs";

export { VIDEO_GRAMMARS, VIDEO_EXAMPLES };

export const VIDEO_SCENES = { ...VIDEO_GRAMMARS, ...VIDEO_EXAMPLES };
