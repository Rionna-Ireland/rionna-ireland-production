-- Circle member token cache (FABLE_AUDIT P3): persist minted member JWTs so
-- feed/badge/session/poller paths reuse one token per ~hour instead of
-- minting a fresh Circle token on every request.
ALTER TABLE "member" ADD COLUMN "circleAccessToken" TEXT;
ALTER TABLE "member" ADD COLUMN "circleAccessTokenExpiresAt" TIMESTAMP(3);
