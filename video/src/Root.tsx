import { Composition } from "remotion";
import { DyeCastFilm, FULL_BEATS, SHORT_BEATS } from "./Film";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/geist";
import "./style.css";

const seconds = (beats: typeof FULL_BEATS) => beats.reduce((sum, beat) => sum + beat.seconds, 0);

export function Root() {
  return (
    <>
      <Composition id="DyeCastDraft" component={DyeCastFilm} durationInFrames={seconds(FULL_BEATS) * 30}
        fps={30} width={1920} height={1080} defaultProps={{ short: false }} />
      <Composition id="DyeCastShort" component={DyeCastFilm} durationInFrames={seconds(SHORT_BEATS) * 30}
        fps={30} width={1080} height={1920} defaultProps={{ short: true }} />
    </>
  );
}
