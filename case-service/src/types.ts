// Shared data shapes for the Alibi case service.
//
// Flow: the headset scans the room -> RoomObject[] -> planCase() decides the
// logic of the mystery -> a writer (Claude or the offline template) turns the
// plan into dialogue -> assembleCase() builds a CaseFile -> solveCase() proves
// the case is fair and has exactly one answer before the player ever sees it.

/** One real object the headset found in the player's room. */
export interface RoomObject {
  id: string;
  /** Plain name, e.g. "mug", "book", "poster". */
  label: string;
  /** Printed text that is clearly readable on the object, e.g. ["KOBAYASHI"]. */
  text: string[];
  /**
   * The scan's pick of the most distinctive word in `text`: a name or brand
   * a liar would borrow ("Dorian" from "The Picture of Dorian Gray"). Optional.
   */
  clueWord?: string;
  /** True when the player can see it from their seat. Only these can hold clues. */
  visibleFromSeat: boolean;
  /** How sure the scan is about the object and its text, 0..1. */
  confidence: number;
  /** True for a prop the game places on the table when the room is too bare. */
  prop?: boolean;
}

/** A word the liar "borrows" from an object in the room. */
export interface LieWord {
  /** The word as the suspect says it, e.g. "Kobayashi". */
  word: string;
  objectId: string;
  /** Label shown on the object when the string snaps, e.g. "KOBAYASHI, printed on the mug". */
  pinLabel: string;
}

/** A tempting word an innocent suspect says that does NOT come from the room. */
export interface Herring {
  suspectId: string;
  word: string;
  /** The object the player is likely to try pinning it to, if any. */
  nearObjectId: string | null;
  /** What the game says when the pin fails. */
  rebuttal: string;
}

export interface PlannedSuspect {
  id: string;
  name: string;
  relation: string;
  isLiar: boolean;
  /** Words this suspect must say, each exactly once, wrapped in [[ ]]. */
  requiredWords: string[];
}

/** The logic of a case, decided in code before any dialogue is written. */
export interface CasePlan {
  seed: number;
  victim: { name: string; occupation: string };
  timeOfDeath: string;
  suspects: PlannedSuspect[];
  lies: LieWord[];
  herrings: Herring[];
  /** Room words nobody may say unless they are one of the liar's lie words. */
  forbiddenWords: string[];
  /** Props to place on the player's table (empty unless the room was bare). */
  props: RoomObject[];
}

/** Dialogue from a writer. Grabbable words are wrapped in [[double brackets]]. */
export interface CaseDraft {
  intro: string[];
  suspects: { id: string; lines: string[] }[];
  confession: string;
}

/** A grabbable word inside a caption line. start/end index the clean text. */
export interface CaptionWord {
  wordId: string;
  text: string;
  start: number;
  end: number;
}

export interface CaptionLine {
  id: string;
  /** Text with the [[ ]] markers removed, ready to display. */
  text: string;
  words: CaptionWord[];
}

/** Everything the headset needs to play one case. Sent to Unity as JSON. */
export interface CaseFile {
  version: 1;
  caseId: string;
  seed: number;
  writer: "llm" | "template";
  victim: { name: string; occupation: string };
  timeOfDeath: string;
  intro: string[];
  suspects: {
    id: string;
    name: string;
    relation: string;
    isLiar: boolean;
    lines: CaptionLine[];
  }[];
  /** Correct pins: dropping wordId onto objectId snaps the string tight. */
  pins: { wordId: string; objectId: string; label: string }[];
  /** Wrong-but-tempting words and what to say when they are pinned. */
  herrings: { wordId: string; nearObjectId: string | null; rebuttal: string }[];
  /** The liar glances at objectId this many ms before saying wordId. */
  glances: { wordId: string; objectId: string; leadMs: number }[];
  confession: string;
  props: RoomObject[];
}

export interface SolveResult {
  ok: boolean;
  errors: string[];
}
