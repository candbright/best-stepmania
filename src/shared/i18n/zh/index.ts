import chartTypes from "./chartTypes";
import common from "./common";
import editor from "./editor";
import editorSongSelect from "./editorSongSelect";
import evaluation from "./evaluation";
import gameplay from "./gameplay";
import help from "./help";
import judgment from "./judgment";
import musicPlayer from "./musicPlayer";
import playerOptions from "./playerOptions";
import selectMusic from "./selectMusic";
import settings from "./settings";
import songPacks from "./songPacks";
import title from "./title";

export default {
  ...common,
  ...title,
  ...editorSongSelect,
  ...selectMusic,
  ...playerOptions,
  ...help,
  ...gameplay,
  ...evaluation,
  ...settings,
  ...editor,
  ...judgment,
  ...chartTypes,
  ...musicPlayer,
  ...songPacks,
} as const;
