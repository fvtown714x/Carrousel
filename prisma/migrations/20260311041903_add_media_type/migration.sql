/*
  Warnings:

  - Added the required column `type` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "duration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "type" TEXT NOT NULL,
    "streamId" TEXT,
    "originalUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Video_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Video" ("createdAt", "description", "duration", "id", "originalUrl", "shopId", "status", "streamId", "thumbnailUrl", "title", "updatedAt") SELECT "createdAt", "description", "duration", "id", "originalUrl", "shopId", "status", "streamId", "thumbnailUrl", "title", "updatedAt" FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE INDEX "Video_shopId_idx" ON "Video"("shopId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
