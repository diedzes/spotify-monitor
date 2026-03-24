export type ScheduledRow = {
  position: number;
  sourceKey: string | null;
  spotifyTrackId: string | null;
  title: string;
  artists: string;
  album: string;
  spotifyUrl: string;
  sourceName: string;
  status: "scheduled" | "conflict";
  conflictReason: string | null;
  /** Korte uitleg voor de gebruiker (NL) */
  conflictDetail: string | null;
  locked: boolean;
  replacedManually: boolean;
  /** Track komt ook voor in de reference playlist */
  overlapsReference: boolean;
};
