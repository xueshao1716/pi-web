import { IMAGE_GRAMMARS } from "./image-grammars.mjs";
import { IMAGE_EXAMPLES } from "./image-examples.mjs";

export { IMAGE_GRAMMARS, IMAGE_EXAMPLES };

export const IMAGE_SCENES = { ...IMAGE_GRAMMARS, ...IMAGE_EXAMPLES };
