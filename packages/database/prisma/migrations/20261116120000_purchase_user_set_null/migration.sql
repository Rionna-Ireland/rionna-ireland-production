-- S17-01 (W-02): keep Purchase rows when a user is deleted so late Stripe webhooks still resolve.
ALTER TABLE "purchase" DROP CONSTRAINT "purchase_userId_fkey";
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
