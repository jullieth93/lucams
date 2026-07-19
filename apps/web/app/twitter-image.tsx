/*
 * Twitter/X card image (#26). En Next 16 los conventions opengraph-image y twitter-image son
 * independientes: sin este archivo el summary_large_image quedaría sin imagen propia. Reusa el
 * mismo render que opengraph-image.
 */
export { default, size, contentType, alt } from "./opengraph-image";
