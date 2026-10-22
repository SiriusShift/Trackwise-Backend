import { Prisma } from "@prisma/client";

const parseIds = (value) => {
  if (!value) return [];
  const ids = JSON.parse(value);
  return Array.isArray(ids) ? ids.map(Number).filter(Number.isInteger) : [];
};

/*
|--------------------------------------------------------------------------
| Graph filters
|--------------------------------------------------------------------------
| Builds the same filters the transaction table uses (search, status,
| categories, assets, active/inactive) so a graph always describes the rows
| next to it. Returns a Prisma `where` fragment and the matching raw SQL
| conditions for the trend query.
| `defaultStatus` applies only when the client sends no status.
*/
export const buildGraphFilters = (query, defaultStatus) => {
  const { search, status, Categories, Assets, isActive } = query;

  const active = String(isActive) !== "false";
  const categoryIds = parseIds(Categories);
  const assetIds = parseIds(Assets);
  const statusFilter = status || defaultStatus;

  const where = {
    isActive: active,
    ...(search && {
      description: { contains: search, mode: "insensitive" },
    }),
    ...(statusFilter && { status: statusFilter }),
    ...(categoryIds.length && { categoryId: { in: categoryIds } }),
    ...(assetIds.length && { assetId: { in: assetIds } }),
  };

  const sql = Prisma.sql`
    AND "isActive" = ${active}
    ${search ? Prisma.sql`AND "description" ILIKE ${`%${search}%`}` : Prisma.empty}
    ${statusFilter ? Prisma.sql`AND "status"::text = ${statusFilter}` : Prisma.empty}
    ${categoryIds.length ? Prisma.sql`AND "categoryId" IN (${Prisma.join(categoryIds)})` : Prisma.empty}
    ${assetIds.length ? Prisma.sql`AND "assetId" IN (${Prisma.join(assetIds)})` : Prisma.empty}
  `;

  return { where, sql };
};
