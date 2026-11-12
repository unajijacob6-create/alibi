import type { RoomObject } from "../src/types.ts";

const o = (
  id: string,
  label: string,
  text: string[],
  extra: Partial<RoomObject> = {},
): RoomObject => ({ id, label, text, visibleFromSeat: true, confidence: 0.9, ...extra });

/** A lived-in bedroom with plenty of readable text. */
export const bedroom: RoomObject[] = [
  o("mug", "mug", ["KOBAYASHI"]),
  o("book1", "book", ["The Picture of Dorian Gray"]),
  o("poster", "poster", ["Monterey Jazz Festival"]),
  o("box", "cereal box", ["Crunchy Oat Clusters"]),
  o("umbrella", "umbrella", []),
  o("lamp", "lamp", []),
  o("plant", "plant", []),
  o("book2", "book", ["Moby Dick"], { visibleFromSeat: false }),
];

/** A home office: lots of text, some of it repeated across objects. */
export const office: RoomObject[] = [
  o("monitor", "monitor", ["DELL"]),
  o("notebook", "notebook", ["Moleskine"]),
  o("mug", "mug", ["World's Best Boss"]),
  o("poster", "poster", ["Visit Reykjavik"]),
  o("binder1", "binder", ["Quarterly Reports"]),
  o("binder2", "binder", ["Quarterly Budget"]),
  o("clock", "clock", ["Seiko"], { confidence: 0.4 }),
  o("guitar", "guitar", ["Fender"]),
];

/** A nearly empty room: the planner must add props. */
export const bareRoom: RoomObject[] = [
  o("chair", "chair", []),
  o("lamp", "lamp", []),
  o("sign", "sign", ["EXIT"]),
];

/** Nothing at all detected. */
export const emptyRoom: RoomObject[] = [];

export const allRooms = { bedroom, office, bareRoom, emptyRoom };
