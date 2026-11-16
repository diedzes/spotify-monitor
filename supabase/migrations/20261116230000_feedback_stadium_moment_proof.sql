-- Stadium plays (2026-11-16): when in the match the track was played, and how
-- we know. A goal tune is different proof from background music in the
-- warm-up, and "the DJ confirmed it" is different from "there is a clip".
-- Both are free text columns with a fixed set of values in the app
-- (lib/stadium-play-options.ts); null means not recorded.
ALTER TABLE "feedback_entries" ADD COLUMN IF NOT EXISTS "stadiumMoment" TEXT;
ALTER TABLE "feedback_entries" ADD COLUMN IF NOT EXISTS "stadiumProof" TEXT;
