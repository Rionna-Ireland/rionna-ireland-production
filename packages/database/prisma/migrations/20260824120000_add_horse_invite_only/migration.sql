-- S9-05: invite-only horses — per-horse access flag; the HorseFollow row is
-- the access grant, this flag gates self-follow + member visibility.
ALTER TABLE "horse" ADD COLUMN "inviteOnly" BOOLEAN NOT NULL DEFAULT false;
