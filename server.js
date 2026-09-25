const express = require('express');
const prisma = require('./db/mysqlDB');
require('dotenv').config();
const app = express();
const cors = require('cors');
const axios = require('axios');
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://india-league-tables.vercel.app',
    'https://*.vercel.app',// Allow all subdomains of vercel.app
    'https://uat-indialeaguestables.debtcircle.in',
    'https://*.debtcircle.in',
    '*'
  ],
  credentials: true
}));

app.use(express.urlencoded({ limit: '10mb', extended: true }));

BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.users.findMany();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/', async (req, res) => {

  res.json({ success: true });
});


// const getShortMonthName = (fullMonthName) => {
//   return fullMonthName.slice(0, 3);
// };

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months start at 0
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ─── Helper: Calculate Levenshtein Distance ─────────────────────────
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

// ─── Helper: Calculate Similarity Percentage ────────────────────────
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  if (maxLength === 0) return 100;

  return ((maxLength - distance) / maxLength) * 100;
}

// ─── Helper: Token-based Word Matching (bonus similarity) ─────────
function tokenSimilarity(str1, str2) {
  const tokens1 = str1.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const tokens2 = str2.toLowerCase().trim().split(/\s+/).filter(Boolean);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  let matchingTokens = 0;
  const usedTokens2 = new Set();

  for (const token1 of tokens1) {
    for (let i = 0; i < tokens2.length; i++) {
      if (usedTokens2.has(i)) continue;

      const sim = calculateSimilarity(token1, tokens2[i]);
      if (sim >= 70) { // token-level match threshold
        matchingTokens++;
        usedTokens2.add(i);
        break;
      }
    }
  }

  const maxTokens = Math.max(tokens1.length, tokens2.length);
  return (matchingTokens / maxTokens) * 100;
}

// ─── Helper: Combined Similarity Score ──────────────────────────────
function getCombinedSimilarity(str1, str2) {
  const charSim = calculateSimilarity(str1, str2);
  const tokenSim = tokenSimilarity(str1, str2);

  // Weighted: character-level 60%, token-level 40%
  return (charSim * 0.6) + (tokenSim * 0.4);
}


/* ---------- helpers ---------- */

function excelSerialToDate(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  const n = Number(serial);
  if (Number.isNaN(n)) return null;
  return new Date((n - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function parseTenor(tenor) {
  const out = { years: 0, months: 0, days: 0 };
  if (!tenor) return out;
  const y = /(\d+)\s*YEAR/i.exec(tenor);
  const m = /(\d+)\s*MONTH/i.exec(tenor);
  const d = /(\d+)\s*DAY/i.exec(tenor);
  if (y) out.years = parseInt(y[1], 10);
  if (m) out.months = parseInt(m[1], 10);
  if (d) out.days = parseInt(d[1], 10);
  return out;
}

// "SECURED" / "UNSECURED" -> 1 / 0   (for master_issuer.secured_flag)
function securedToFlag(s) {
  if (!s) return null;
  const u = String(s).toUpperCase();
  if (u.includes('UNSECURED')) return 0;
  if (u.includes('SECURED')) return 1;
  return null;
}

const convertToCrores = (n) => {
  return n * 10000000;
}

// "SECURED" -> 'secured'  (enum for isin_re_issuance_details.secured_unsecured)
function securedToEnum(s) {
  if (!s) return null;
  const u = String(s).toUpperCase();
  if (u.includes('UNSECURED')) return 'unsecured';
  if (u.includes('SECURED')) return 'secured';
  return null;
}

// "CLOSE" / "CLOSED" -> 'closed'  (enum for isin_re_issuance_details.type_of_book_bidding)
function bookBiddingToEnum(s) {
  if (!s) return null;
  const u = String(s).toUpperCase();
  if (u.includes('OPEN')) return 'open';
  if (u.includes('CLOSE')) return 'closed';
  return null;
}

// "MONTHLY" -> 12, "QUARTERLY" -> 4, etc.
function couponFreqToInt(s) {
  if (!s) return null;
  const u = String(s).toUpperCase().trim();
  const map = {
    WEEKLY: 52,
    MONTHLY: 12,
    QUARTERLY: 4,
    'HALF YEARLY': 2,
    'HALF-YEARLY': 2,
    'SEMI-ANNUAL': 2,
    'SEMI-ANNUALLY': 2,
    YEARLY: 1,
    ANNUAL: 1,
    ANNUALLY: 1,
  };
  return map[u] ?? null;
}

// { years, months, days } -> decimal years (Float)
function tenorToFloat(t) {
  return (t.years || 0) + (t.months || 0) / 12 + (t.days || 0) / 365;
}


// ==========================================
// MAIN ADMIN APIs:
// ==========================================

app.get('/getRatings', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT rating FROM master_issuer_rating;
    `);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/bulk-issuers-upload', async (req, res) => {
  const issuers = Array.isArray(req.body) ? req.body : req.body?.issuers || [];

  if (!issuers.length) {
    return res.status(400).json({ error: 'No issuer records provided' });
  }

  const summary = { success: 0, failed: 0, errors: [] };
  let count = 0;

  /* =========================================================
   * Name normalization + fuzzy matching helpers
   * ========================================================= */

  // Values treated as "no value supplied"
  const PLACEHOLDER_VALUES = new Set([
    'not found', 'na', 'n/a', 'n.a', 'none', 'nil', 'null', 'undefined',
    '-', '--', 'not applicable', 'not available', 'notavailable',
    'tbd', 'tba', 'unknown'
  ]);

  /**
   * Normalize a name for comparison:
   *  - lowercase
   *  - strip punctuation (commas, periods, apostrophes, &, etc.)
   *  - collapse whitespace
   *  - convert placeholders like "Not Found" to null
   */
  function normalizeName(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).toLowerCase();
    // Any non-letter / non-number / non-whitespace becomes a space
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (PLACEHOLDER_VALUES.has(s)) return null;
    return s;
  }

  function tokenize(normalized) {
    if (!normalized) return null;
    const tokens = normalized.split(' ').filter(Boolean);
    return tokens.length ? new Set(tokens) : null;
  }

  /**
   * Returns true if every token of the smaller set exists in the larger set,
   * and the smaller set has at least 2 tokens (avoids matching on a single
   * generic word).
   */
  function isTokenSubset(setA, setB) {
    if (!setA || !setB) return false;
    const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
    if (small.size < 2) return false;
    for (const t of small) {
      if (!large.has(t)) return false;
    }
    return true;
  }

  /**
   * Find an existing master record by fuzzy name match, or insert a new one.
   * Always searches the FULL name column, never the short_name.
   * Returns the row id, or null if rawName is empty / a placeholder.
   */
  async function findOrCreateMaster(
    tx,
    { table, nameColumn, shortNameColumn = null, rawName }
  ) {
    if (rawName === null || rawName === undefined) return null;

    const cleanName = String(rawName).trim();
    if (!cleanName) return null;

    const normalized = normalizeName(cleanName);
    if (!normalized) return null; // placeholder, e.g. "Not Found"

    const targetTokens = tokenize(normalized);

    // Pull BOTH the full-name and short-name columns for every row
    const selectCols = shortNameColumn
      ? `id, \`${nameColumn}\` AS name, \`${shortNameColumn}\` AS short_name`
      : `id, \`${nameColumn}\` AS name`;

    const rows = await tx.$queryRawUnsafe(
      `SELECT ${selectCols} FROM \`${table}\``
    );

    // Try to match a given candidate string against the target
    const matches = (candidate) => {
      const norm = normalizeName(candidate);
      if (!norm) return false;
      if (norm === normalized) return true;
      return isTokenSubset(targetTokens, tokenize(norm));
    };

    // 1) exact / fuzzy on the FULL name column
    let match = rows.find((r) => matches(r.name));

    // 2) fallback: exact / fuzzy on the SHORT name column
    if (!match && shortNameColumn) {
      match = rows.find((r) => matches(r.short_name));
    }

    if (match) {
      // Backfill the full-name column if it was NULL / empty,
      // so future runs match on the name column directly.
      if (shortNameColumn) {
        const existingName = match.name;
        const isEmpty =
          existingName === null ||
          existingName === undefined ||
          String(existingName).trim() === '';

        if (isEmpty) {
          await tx.$executeRawUnsafe(
            `UPDATE \`${table}\` SET \`${nameColumn}\` = ? WHERE id = ?`,
            cleanName,
            match.id
          );
        }
      }
      return match.id;
    }

    // Insert new master row
    if (shortNameColumn) {
      const shortName =
        cleanName.length > 50 ? cleanName.slice(0, 50) : cleanName;
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${table}\` (\`${nameColumn}\`, \`${shortNameColumn}\`) VALUES (?, ?)`,
        cleanName,
        shortName
      );
    } else {
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${table}\` (\`${nameColumn}\`) VALUES (?)`,
        cleanName
      );
    }

    const inserted = await tx.$queryRawUnsafe(
      `SELECT id FROM \`${table}\` WHERE \`${nameColumn}\` = ? LIMIT 1`,
      cleanName
    );
    return inserted[0]?.id ?? null;
  }

  /* =========================================================
   * Main loop
   * ========================================================= */

  for (const item of issuers) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const isin = item.isin;
        const issuerName = item.issuerName;
        count++;
        console.log('processing item: ', count, isin);

        if (!isin || !issuerName) {
          throw new Error('Missing required field: isin or issuerName');
        }

        const allotmentDate = excelSerialToDate(item.allotmentDate);
        const maturityDate = excelSerialToDate(item.maturityDate);
        const tenure = parseTenor(item.tenor);

        /* ---------- 1. issuer_details ---------- */
        const issuerId = await findOrCreateMaster(tx, {
          table: 'issuer_details',
          nameColumn: 'issuer_name',
          rawName: issuerName
        });
        if (!issuerId) throw new Error('Failed to resolve issuer_details');

        /* ---------- 2. master_arranger ---------- */
        const arrangerId = await findOrCreateMaster(tx, {
          table: 'master_arranger',
          nameColumn: 'arranger_name',
          shortNameColumn: 'short_name',
          rawName: item.leadManagerArranger
        });

        /* ---------- 3. master_trustee ---------- */
        const trusteeId = await findOrCreateMaster(tx, {
          table: 'master_trustee',
          nameColumn: 'trustee_name',
          shortNameColumn: 'short_name',
          rawName: item.trustee
        });

        /* ---------- 4. master_registrar ---------- */
        const registrarId = await findOrCreateMaster(tx, {
          table: 'master_registrar',
          nameColumn: 'registrar_name',
          shortNameColumn: 'short_name',
          rawName: item.registrar
        });

        /* ---------- 4b. master_agency ---------- */
        const agencyId = await findOrCreateMaster(tx, {
          table: 'master_agency',
          nameColumn: 'agency_name',
          shortNameColumn: 'short_name',
          rawName: item.rating_agency
        });

        /* ---------- 5. master_issuer (upsert by isin) ---------- */
        const existingMasterIssuer = await tx.$queryRawUnsafe(
          `SELECT id FROM master_issuer WHERE isin = ? LIMIT 1`,
          isin
        );

        let isinId;
        if (existingMasterIssuer.length) {
          isinId = existingMasterIssuer[0].id;

          // Guard secured_flag: only compute when the source value is actually present,
          // otherwise pass null so COALESCE keeps the existing flag.
          const securedFlag =
            item.securedUnsecured !== null && item.securedUnsecured !== undefined
              ? securedToFlag(item.securedUnsecured)
              : null;

          await tx.$executeRawUnsafe(
            `UPDATE master_issuer
        SET issuer_master_id = COALESCE(?, issuer_master_id),
            security_name    = COALESCE(?, security_name),
            issue_size       = COALESCE(?, issue_size),
            face_value       = COALESCE(?, face_value),
            allotment_date   = COALESCE(?, allotment_date),
            maturity_date    = COALESCE(?, maturity_date),
            secured_flag     = COALESCE(?, secured_flag),
            is_visible       = 1,
            updated_at       = NOW()
      WHERE id = ?`,
            issuerId,
            issuerName,
            item.amountRaised ?? null,
            item.faceValue ?? null,
            allotmentDate,
            maturityDate,
            securedFlag,
            isinId
          );
        } else {
          await tx.$executeRawUnsafe(
            `INSERT INTO master_issuer (
               issuer_master_id, isin, security_name,
               issue_size, face_value, allotment_date, maturity_date,
               secured_flag, is_visible,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
            issuerId,
            isin,
            issuerName,
            item.amountRaised ?? null,
            item.faceValue ?? null,
            allotmentDate,
            maturityDate,
            securedToFlag(item.securedUnsecured)
          );
          const miRows = await tx.$queryRawUnsafe(
            `SELECT id FROM master_issuer WHERE isin = ? LIMIT 1`,
            isin
          );
          isinId = miRows[0].id;
        }

        /* ---------- 5b. master_issuer_rating (upsert by issuer_id + agency_id) ---------- */
        if (
          agencyId !== null &&
          ((item.creditRating !== null && item.creditRating !== undefined) ||
            (item.outlook !== null && item.outlook !== undefined))
        ) {
          const existingRating = await tx.$queryRawUnsafe(
            `SELECT id FROM master_issuer_rating
              WHERE issuer_id = ? AND agency_id = ?
              LIMIT 1`,
            isinId,
            agencyId
          );

          if (existingRating.length) {
            await tx.$executeRawUnsafe(
              `UPDATE master_issuer_rating
                  SET rating      = ?,
                      outlook     = ?,
                      rating_date = ?
                WHERE id = ?`,
              item.creditRating ?? null,
              item.outlook ?? null,
              allotmentDate,
              existingRating[0].id
            );
          } else {
            await tx.$executeRawUnsafe(
              `INSERT INTO master_issuer_rating
                 (rating, watch, outlook, rating_date, agency_id, issuer_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              item.creditRating ?? null,
              null,
              item.outlook ?? null,
              allotmentDate,
              agencyId,
              isinId
            );
          }
        }

        /* ---------- 6. isin_re_issuance (upsert by isin) ---------- */
        const existingReIssuance = await tx.$queryRawUnsafe(
          `SELECT id FROM isin_re_issuance WHERE isin = ? LIMIT 1`,
          isin
        );

        let reIssuanceId;
        if (existingReIssuance.length) {
          reIssuanceId = existingReIssuance[0].id;

          const securedFlag =
            item.securedUnsecured !== null && item.securedUnsecured !== undefined
              ? securedToFlag(item.securedUnsecured)
              : null;

          await tx.$executeRawUnsafe(
            `UPDATE isin_re_issuance
        SET isin_id          = COALESCE(?, isin_id),
            issuer_master_id = COALESCE(?, issuer_master_id),
            allotment_date   = COALESCE(?, allotment_date),
            issue_size       = COALESCE(?, issue_size),
            face_value       = COALESCE(?, face_value),
            maturity_date    = COALESCE(?, maturity_date),
            security_name    = COALESCE(?, security_name),
            secured_flag     = COALESCE(?, secured_flag),
            is_visible       = 1,
            is_updated       = 1,
            is_main          = 1,
            updated_at       = NOW()
      WHERE id = ?`,
            isinId,
            issuerId,
            allotmentDate,
            item.amountRaised ?? null,
            item.faceValue ?? null,
            maturityDate,
            issuerName,
            securedFlag,
            reIssuanceId
          );
        } else {
          await tx.$executeRawUnsafe(
            `INSERT INTO isin_re_issuance (
               isin_id, isin, issuer_master_id,
               allotment_date, issue_size, face_value, maturity_date,
               security_name, secured_flag, is_visible, is_updated, is_main,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, NOW(), NOW())`,
            isinId,
            isin,
            issuerId,
            allotmentDate,
            item.amountRaised ?? null,
            item.faceValue ?? null,
            maturityDate,
            issuerName,
            securedToFlag(item.securedUnsecured)
          );
          const riRows = await tx.$queryRawUnsafe(
            `SELECT id FROM isin_re_issuance WHERE isin = ? LIMIT 1`,
            isin
          );
          reIssuanceId = riRows[0].id;
        }

        /* ---------- 7. isin_re_issuance_details (upsert by re_issuance_id) ---------- */
        const existingDetails = await tx.$queryRawUnsafe(
          `SELECT id FROM isin_re_issuance_details WHERE re_issuance_id = ? LIMIT 1`,
          reIssuanceId
        );

        const v = [
          null,                                                  // 1  bidding_date
          issuerName,                                            // 2  issuer_name
          isin,                                                  // 3  isin
          item.issueDescription ?? null,                         // 4
          item.typeOfIssuanceTypeOfPlacement ?? null,            // 5
          allotmentDate,                                         // 6
          item.faceValue ?? null,                                // 7
          item.creditRating ?? null,                             // 8
          bookBiddingToEnum(item.typeOfBookBidding),             // 9
          item.priceInRs ?? null,                                // 10
          item.spreadBps ?? null,                                // 11
          item.yield ?? null,                                    // 12
          item.mannerOfAllotment ?? null,                        // 13
          item.mannerOfSettlement ?? null,                       // 14
          item.linkOfGidPpm ?? null,                             // 15
          item.linkOfKidTermsheet ?? null,                       // 16
          item.baseIssueSize ?? null,                            // 17
          item.greenShoeOption ?? null,                          // 18
          item.amountRaised ?? null,                             // 19
          item.coupon_rate ?? null,                              // 20
          couponFreqToInt(item.couponFrequency),                 // 21
          item.noOfSuccesfulBiddersCategoryOfInvestors ?? null,  // 22
          item.typeOfBidding ?? null,                            // 23
          securedToEnum(item.securedUnsecured),                  // 24
          item.tenor ?? null,                                    // 25
          item.maturityType ?? null,                             // 26
          item.interestPaymentType ?? null,                      // 27
          item.anchorAmount ?? null,                             // 28
          item.noOfAnchorInvestors ?? null,                      // 29
          item.totalQibBiddingAmount ?? null,                    // 30
          item.totalQibAmountAcceptedAmount ?? null,             // 31
          item.totalNonQibBiddingAmount ?? null,                 // 32
          item.totalNonQibAmountAcceptedAmountInRsCrs ?? null,   // 33
          item.cutOffYieldPriceRs ?? null,                       // 34
          item.weightedAverageCutOffYieldPriceRsSpreadBps ?? null, // 35
          'YES'                                                  // 36
        ];

        if (existingDetails.length) {
          await tx.$executeRawUnsafe(
            `UPDATE isin_re_issuance_details SET
       bidding_date                          = ?,
       issuer_name                           = ?,
       isin                                  = ?,
       issue_description                     = COALESCE(?, issue_description),
       type_of_issuance                      = ?,
       allotment_date                        = ?,
       face_value                            = COALESCE(?, face_value),
       credit_rating                         = ?,
       type_of_book_bidding                  = ?,
       price                                 = COALESCE(?, price),
       spread                                = COALESCE(?, spread),
       yield                                 = COALESCE(?, yield),
       manner_of_allotment                   = COALESCE(?, manner_of_allotment),
       manner_of_settlement                  = COALESCE(?, manner_of_settlement),
       link_of_gid_ppm                       = COALESCE(?, link_of_gid_ppm),
       link_of_kid_term_sheet                = COALESCE(?, link_of_kid_term_sheet),
       base_issue_size                       = COALESCE(?, base_issue_size),
       green_shoe_option                     = ?,
       amount_raised                         = COALESCE(?, amount_raised),
       coupon                                = ?,
       coupon_frequency                      = ?,
       successful_bidders_category           = ?,
       type_of_bidding                       = ?,
       secured_unsecured                     = ?,
       tenor                                 = ?,
       maturity_type                         = COALESCE(?, maturity_type),
       interest_payment_type                 = COALESCE(?, interest_payment_type),
       anchor_amount                         = COALESCE(?, anchor_amount),
       number_of_anchor_investors            = ?,
       total_qib_bidding                     = ?,
       total_qib_amount_accepted             = ?,
       total_non_qib_bidding                 = ?,
       total_non_qib_amount_accepted         = ?,
       cutoff_yield_price                    = COALESCE(?, cutoff_yield_price),
       weighted_average_cutoff_yield_price   = COALESCE(?, weighted_average_cutoff_yield_price),
       issuance_done_through_bidding_process = ?
     WHERE id = ?`,
            ...v,
            existingDetails[0].id
          );
        } else {
          await tx.$executeRawUnsafe(
            `INSERT INTO isin_re_issuance_details (
               re_issuance_id, bidding_date, issuer_name, isin,
               issue_description, type_of_issuance,
               allotment_date, face_value, credit_rating,
               type_of_book_bidding, price, spread, yield,
               manner_of_allotment, manner_of_settlement,
               link_of_gid_ppm, link_of_kid_term_sheet,
               base_issue_size, green_shoe_option, amount_raised,
               coupon, coupon_frequency,
               successful_bidders_category, type_of_bidding,
               secured_unsecured, tenor, maturity_type,
               interest_payment_type,
               anchor_amount, number_of_anchor_investors,
               total_qib_bidding, total_qib_amount_accepted,
               total_non_qib_bidding, total_non_qib_amount_accepted,
               cutoff_yield_price, weighted_average_cutoff_yield_price,
               issuance_done_through_bidding_process
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?,
               ?, ?,
               ?, ?, ?,
               ?,
               ?, ?,
               ?, ?,
               ?, ?,
               ?, ?,
               ?
             )`,
            reIssuanceId,
            ...v
          );
        }

        /* ---------- 8. link tables (dedup-safe) ---------- */
        if (arrangerId !== null) {
          await tx.$executeRawUnsafe(
            `INSERT INTO issuer_arranger (arranger_id, issuer_id)
             SELECT ?, ? FROM DUAL
             WHERE NOT EXISTS (
               SELECT 1 FROM issuer_arranger
               WHERE arranger_id = ? AND issuer_id = ?
             )`,
            arrangerId, isinId, arrangerId, isinId
          );
        }
        if (trusteeId !== null) {
          await tx.$executeRawUnsafe(
            `INSERT INTO issuer_trustee (trustee_id, issuer_id)
             SELECT ?, ? FROM DUAL
             WHERE NOT EXISTS (
               SELECT 1 FROM issuer_trustee
               WHERE trustee_id = ? AND issuer_id = ?
             )`,
            trusteeId, isinId, trusteeId, isinId
          );
        }
        if (registrarId !== null) {
          await tx.$executeRawUnsafe(
            `INSERT INTO issuer_registrar (registrar_id, issuer_id)
             SELECT ?, ? FROM DUAL
             WHERE NOT EXISTS (
               SELECT 1 FROM issuer_registrar
               WHERE registrar_id = ? AND issuer_id = ?
             )`,
            registrarId, isinId, registrarId, isinId
          );
        }

        /* ---------- 9. issuer_coupon_details (upsert) ---------- */
        if (item.coupon_rate !== null && item.coupon_rate !== undefined) {
          const existing = await tx.$queryRawUnsafe(
            `SELECT id FROM issuer_coupon_details WHERE issuer_id = ? LIMIT 1`,
            isinId
          );

          const couponRate = String(item.coupon_rate);

          if (existing.length) {
            await tx.$executeRawUnsafe(
              `UPDATE issuer_coupon_details
                  SET coupon_rate      = ?,
                      coupon_rate_date = ?,
                      updated_at       = NOW()
                WHERE id = ?`,
              couponRate,
              allotmentDate,
              existing[0].id
            );
          } else {
            await tx.$executeRawUnsafe(
              `INSERT INTO issuer_coupon_details
                 (issuer_id, coupon_rate, coupon_pay_date, coupon_rate_date, coupon_type)
               VALUES (?, ?, ?, ?, ?)`,
              isinId, couponRate, null, allotmentDate, null
            );
          }
        }

        /* ---------- 10. issuer_tenure_details (upsert) ---------- */
        if (item.tenor) {
          const existing = await tx.$queryRawUnsafe(
            `SELECT id FROM issuer_tenure_details WHERE issuer_id = ? LIMIT 1`,
            isinId
          );

          const tFloat = tenorToFloat(tenure);

          if (existing.length) {
            await tx.$executeRawUnsafe(
              `UPDATE issuer_tenure_details
                  SET tenure           = ?,
                      tenure_no_years  = ?,
                      tenure_no_months = ?,
                      tenure_no_days   = ?,
                      updated_at       = NOW()
                WHERE id = ?`,
              tFloat,
              tenure.years,
              tenure.months,
              tenure.days,
              existing[0].id
            );
          } else {
            await tx.$executeRawUnsafe(
              `INSERT INTO issuer_tenure_details
                 (issuer_id, tenure, tenure_no_years, tenure_no_months, tenure_no_days)
               VALUES (?, ?, ?, ?, ?)`,
              isinId,
              tFloat,
              tenure.years,
              tenure.months,
              tenure.days
            );
          }
        }

        return { isin, issuerId, isinId, reIssuanceId, agencyId };
      });

      summary.success += 1;
    } catch (err) {
      console.error(`Failed to insert isin=${item?.isin}:`, err);
      summary.failed += 1;
      summary.errors.push({ isin: item?.isin, error: err.message });
    }
  }

  return res.status(200).json({
    message: 'Bulk issuers upload completed',
    summary
  });
});

app.post('/market-snapshot-data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');


    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // --- Previous month (for month-over-month comparison) ---
    const prevMonthStart = new Date(currentStartDate);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(currentEndDate);
    prevMonthEnd.setMonth(prevMonthEnd.getMonth() - 1);

    const pmStart = formatDate(prevMonthStart);
    const pmEnd = formatDate(prevMonthEnd);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);


    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);
    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);


    /* ---------------- SECTION-1 ---------------- */
    const totalIssuers = `
      SELECT COUNT(DISTINCT issuer_master_id) AS total_issuers
      FROM isin_re_issuance
      WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
    `;

    const totalIssueCount = `
        SELECT COUNT(isin) AS total_isins
        FROM isin_re_issuance
        WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
    `;

    const topSectorNameQuery = `
      SELECT bs.description AS sector_name
      FROM isin_re_issuance ir
      INNER JOIN master_business_sector bs ON ir.business_sector = bs.code
      WHERE ir.allotment_date BETWEEN ? AND ?
        AND ir.is_visible = 1
        AND ir.business_sector <> 0
      GROUP BY bs.description
      ORDER BY SUM(ir.issue_size) DESC
      LIMIT 1
    `;

    const totalIssueSize = `
        SELECT 
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS total_issue_size
        FROM isin_re_issuance
        WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
    `;

    // const AvgIssueSize = `
    //     SELECT  
    //     COALESCE(ROUND(AVG(issue_size) / 10000000), 0) AS avg_issue_size
    //     FROM isin_re_issuance
    //     WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
    // `;



    const totalUniqueIssuers = `
      SELECT COUNT(DISTINCT issuer_master_id) AS total_issuers
      FROM isin_re_issuance
      WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
    `;

    const topIssuerByIssueSize = `
      SELECT 
          id.issuer_name,
          SUM(ir.issue_size) AS total_issue_size
      FROM isin_re_issuance ir
      INNER JOIN issuer_details id ON ir.issuer_master_id = id.id
      WHERE ir.allotment_date BETWEEN ? AND ? AND (ir.is_visible = 1)
      GROUP BY ir.issuer_master_id, id.issuer_name
      ORDER BY total_issue_size DESC
      LIMIT 1;
    `;

    const topIssuerByIssuerNumber = `
        SELECT 
            id.issuer_name,
            COUNT(ir.isin) AS isin_count
        FROM isin_re_issuance ir
        INNER JOIN issuer_details id ON ir.issuer_master_id = id.id
        WHERE ir.allotment_date BETWEEN ? AND ? AND (ir.is_visible = 1)
        GROUP BY ir.issuer_master_id, id.issuer_name
        ORDER BY isin_count DESC
        LIMIT 1;
    `;

    const topRating = `
      SELECT 
          mr.rating,
          COUNT(*) AS count_entries
      FROM isin_re_issuance ir
      INNER JOIN master_issuer_rating mr ON ir.isin_id = mr.issuer_id
      WHERE ir.allotment_date BETWEEN ? AND ? AND (ir.is_visible = 1)
      GROUP BY mr.rating
      ORDER BY count_entries DESC
      LIMIT 1;
    `;

    /* ---------------- SECTION-2 ---------------- */

    const issuerList = `
      WITH latest_rating AS (
          SELECT
              ir.issuer_master_id,
              mr.rating,
              ROW_NUMBER() OVER (
                  PARTITION BY ir.issuer_master_id 
                  ORDER BY mr.rating_date DESC
              ) AS rn
          FROM isin_re_issuance ir
          INNER JOIN master_issuer_rating mr ON ir.isin_id = mr.issuer_id
          WHERE ir.is_visible = 1
      )
      SELECT
          id.issuer_name,
          COUNT(ir.isin) AS isin_count, 
          COALESCE(ROUND(SUM(ir.issue_size) / 10000000), 0) AS total_issue_size,
          lr.rating AS latest_rating,
          bs.description AS sector
      FROM isin_re_issuance ir
      INNER JOIN issuer_details id ON ir.issuer_master_id = id.id
      LEFT JOIN master_business_sector bs ON ir.business_sector = bs.code
      LEFT JOIN latest_rating lr 
          ON ir.issuer_master_id = lr.issuer_master_id AND lr.rn = 1
      WHERE ir.allotment_date BETWEEN ? AND ? AND (ir.is_visible = 1)
      GROUP BY ir.issuer_master_id, id.issuer_name, bs.description, lr.rating
      ORDER BY total_issue_size DESC
      LIMIT 10;
    `;

    const ratingsList = `
        WITH issuer_monthly AS (
            SELECT
                issuer_master_id,
                COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS total_issue_size
            FROM isin_re_issuance
            WHERE allotment_date BETWEEN ? AND ?
              AND is_visible = 1
            GROUP BY issuer_master_id
        ),
        latest_rating AS (
            SELECT
                issuer_id,
                rating,
                ROW_NUMBER() OVER (PARTITION BY issuer_id ORDER BY rating_date DESC) AS rn
            FROM master_issuer_rating
        ),
        rating_agg AS (
            SELECT
                CASE
                    WHEN lr.rating = 'AAA'  THEN 'AAA'
                    WHEN lr.rating = 'AA+'  THEN 'AA+'
                    WHEN lr.rating = 'AA'   THEN 'AA'
                    WHEN lr.rating = 'AA-'  THEN 'AA-'
                    WHEN lr.rating = 'A+'   THEN 'A+'
                    ELSE 'A & below'
                END AS rating_bucket,
                COUNT(DISTINCT ij.issuer_master_id) AS issuer_count,
                SUM(ij.total_issue_size) AS total_issue_size
            FROM issuer_monthly ij
            INNER JOIN latest_rating lr 
                ON ij.issuer_master_id = lr.issuer_id 
                AND lr.rn = 1
            GROUP BY rating_bucket
        ),
        total_size AS (
            SELECT SUM(total_issue_size) AS total_size_sum
            FROM rating_agg
        )
        SELECT
            rating_bucket AS rating_label,
            issuer_count,
            total_issue_size,
            ROUND((total_issue_size / (SELECT total_size_sum FROM total_size)) * 100, 2) AS shares
        FROM rating_agg
        ORDER BY 
            CASE rating_bucket
                WHEN 'AAA'  THEN 1
                WHEN 'AA+'  THEN 2
                WHEN 'AA'   THEN 3
                WHEN 'AA-'  THEN 4
                WHEN 'A+'   THEN 5
                ELSE 6
            END;
      `;

    const sectorList = `
              WITH
              -- 1. All sectors (known + unknown)
              sector_data AS (
                SELECT
                  COALESCE(bs.description, 'Unknown') AS sector_desc,
                  COUNT(ir.isin)                     AS isin_count,
                  COUNT(ir.issuer_master_id)         AS issuer_count,
                  SUM(ir.issue_size)                 AS total_issue_size_raw
                FROM isin_re_issuance ir
                LEFT JOIN master_business_sector bs ON ir.business_sector = bs.code
                WHERE ir.allotment_date BETWEEN ? AND ?
                  AND ir.is_visible = 1
                GROUP BY COALESCE(bs.description, 'Unknown')
              ),

              -- 2. Rank only "valid" sectors: exclude 'Unknown' and the literal 'Others'
              ranked AS (
                SELECT
                  sector_desc,
                  isin_count,
                  issuer_count,
                  total_issue_size_raw,
                  ROW_NUMBER() OVER (ORDER BY total_issue_size_raw DESC) AS rn
                FROM sector_data
                WHERE sector_desc NOT IN ('Unknown', 'Others')
              ),

              -- 3. Split into Top 5 and Others (now always includes the literal 'Others')
              categorized AS (
                -- Top 5 known sectors (excluding 'Unknown' and 'Others')
                SELECT
                  sector_desc AS sector_name,
                  rn AS ord,
                  isin_count,
                  issuer_count,
                  total_issue_size_raw
                FROM ranked
                WHERE rn <= 5

                UNION ALL

                -- Aggregated Others = known sectors ranked >5 + all 'Unknown' + the literal 'Others'
                SELECT
                  'Others' AS sector_name,
                  6 AS ord,
                  SUM(isin_count)        AS isin_count,
                  SUM(issuer_count)      AS issuer_count,
                  SUM(total_issue_size_raw) AS total_issue_size_raw
                FROM (
                  SELECT isin_count, issuer_count, total_issue_size_raw
                  FROM ranked
                  WHERE rn > 5

                  UNION ALL

                  SELECT isin_count, issuer_count, total_issue_size_raw
                  FROM sector_data
                  WHERE sector_desc IN ('Unknown', 'Others')
                ) AS combined_others
                HAVING SUM(isin_count) > 0   -- include only if at least one ISIN exists
              ),

              -- 4. Total raw issue size across all categories (for share calculation)
              total_raw AS (
                SELECT SUM(total_issue_size_raw) AS total_raw_sum
                FROM categorized
              )

            -- 5. Final output
            SELECT
              sector_name,
              isin_count,
              issuer_count,
              COALESCE(ROUND(total_issue_size_raw / 10000000), 0) AS total_issue_size,
              ROUND(
                (total_issue_size_raw / (SELECT total_raw_sum FROM total_raw)) * 100,
                2
              ) AS shares
            FROM categorized
            ORDER BY ord;
      `;

    //COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,

    const sectorAndRatingList = `
        WITH
        -- 1. Base issuances for the period (include all sectors, even unknown)
        base_issuance AS (
          SELECT
            ir.issuer_master_id,
            ir.business_sector,
            ir.issue_size,
            ir.isin,
            COALESCE(bs.description, 'Unknown') AS sector_desc
          FROM isin_re_issuance ir
          LEFT JOIN master_business_sector bs ON ir.business_sector = bs.code
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
        ),

        -- 2. Latest rating per issuer
        latest_rating AS (
          SELECT
            issuer_id,
            rating,
            ROW_NUMBER() OVER (PARTITION BY issuer_id ORDER BY rating_date DESC) AS rn
          FROM master_issuer_rating
        ),
        issuer_rating AS (
          SELECT issuer_id, rating
          FROM latest_rating
          WHERE rn = 1
        ),

        -- 3. Enrich each issuance with the issuer's current rating (may be NULL)
        issuance_with_rating AS (
          SELECT
            b.issuer_master_id,
            b.sector_desc,
            b.issue_size,
            b.isin,
            r.rating
          FROM base_issuance b
          LEFT JOIN issuer_rating r ON b.issuer_master_id = r.issuer_id
        ),

        -- 4. Sector-level aggregates: totals + issue size per rating bucket (includes all sectors)
        sector_agg AS (
          SELECT
            sector_desc,
            COUNT(DISTINCT issuer_master_id)                     AS issuer_count,
            COUNT(DISTINCT isin)                                AS isin_count,
            SUM(issue_size)                                     AS total_issue_size_raw,
            -- Issue size (raw) per rating bucket
            COALESCE(SUM(CASE WHEN rating = 'AAA'    THEN issue_size ELSE 0 END), 0) AS size_AAA,
            COALESCE(SUM(CASE WHEN rating = 'AA+'   THEN issue_size ELSE 0 END), 0) AS size_AAplus,
            COALESCE(SUM(CASE WHEN rating = 'AA'    THEN issue_size ELSE 0 END), 0) AS size_AA,
            COALESCE(SUM(CASE WHEN rating = 'AA-'   THEN issue_size ELSE 0 END), 0) AS size_AAminus,
            COALESCE(SUM(CASE WHEN rating = 'A+'    THEN issue_size ELSE 0 END), 0) AS size_Aplus,
            COALESCE(SUM(CASE
              WHEN rating IS NOT NULL
              AND rating NOT IN ('AAA','AA+','AA','AA-','A+')
              THEN issue_size
              ELSE 0
            END), 0) AS size_A_below_rated,
            COALESCE(SUM(CASE
              WHEN rating IS NULL
              THEN issue_size
              ELSE 0
            END), 0) AS size_A_below_unrated
          FROM issuance_with_rating
          GROUP BY sector_desc
        ),

        -- 5. Rank only known sectors (exclude 'Unknown' and the literal 'Others') by total issue size
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (ORDER BY total_issue_size_raw DESC) AS rn
          FROM sector_agg
          WHERE sector_desc NOT IN ('Unknown', 'Others')   -- 👈 exclude both
        ),

        -- 6. Top 5 known sectors + Others (includes ranked >5, Unknown, and literal 'Others')
        categorized AS (
          -- Top 5 known sectors
          SELECT
            sector_desc AS sector_name,
            rn AS ord,
            issuer_count,
            isin_count,
            total_issue_size_raw,
            size_AAA,
            size_AAplus,
            size_AA,
            size_AAminus,
            size_Aplus,
            size_A_below_rated,
            size_A_below_unrated
          FROM ranked
          WHERE rn <= 5

          UNION ALL

          -- Others = known sectors with rank > 5 + all Unknown + literal 'Others'
          SELECT
            'Others' AS sector_name,
            6 AS ord,
            SUM(issuer_count)                 AS issuer_count,
            SUM(isin_count)                   AS isin_count,
            SUM(total_issue_size_raw)         AS total_issue_size_raw,
            SUM(size_AAA)                     AS size_AAA,
            SUM(size_AAplus)                  AS size_AAplus,
            SUM(size_AA)                      AS size_AA,
            SUM(size_AAminus)                 AS size_AAminus,
            SUM(size_Aplus)                   AS size_Aplus,
            SUM(size_A_below_rated)           AS size_A_below_rated,
            SUM(size_A_below_unrated)         AS size_A_below_unrated
          FROM (
            -- ranked > 5
            SELECT issuer_count, isin_count, total_issue_size_raw,
                  size_AAA, size_AAplus, size_AA, size_AAminus, size_Aplus,
                  size_A_below_rated, size_A_below_unrated
            FROM ranked
            WHERE rn > 5

            UNION ALL

            -- Unknown
            SELECT issuer_count, isin_count, total_issue_size_raw,
                  size_AAA, size_AAplus, size_AA, size_AAminus, size_Aplus,
                  size_A_below_rated, size_A_below_unrated
            FROM sector_agg
            WHERE sector_desc = 'Unknown'

            UNION ALL   -- 👈 add the literal 'Others' sector

            -- literal 'Others' (if it exists)
            SELECT issuer_count, isin_count, total_issue_size_raw,
                  size_AAA, size_AAplus, size_AA, size_AAminus, size_Aplus,
                  size_A_below_rated, size_A_below_unrated
            FROM sector_agg
            WHERE sector_desc = 'Others'
          ) combined_others
          HAVING SUM(issuer_count) > 0   -- include only if at least one issuer exists
        ),

        -- 7. Total issuers across all categories (for share%)
        total_issuers AS (
          SELECT SUM(issuer_count) AS total_issuer_count
          FROM categorized
        )

      -- 8. Final output (divide by 10,000,000 to show in crores)
      SELECT
        sector_name,
        isin_count,
        issuer_count                                                AS total_issuers,
        COALESCE(ROUND(total_issue_size_raw / 10000000), 0)        AS total_issue_size_cr,
        COALESCE(ROUND(size_AAA / 10000000), 0)                    AS "AAA_cr",
        COALESCE(ROUND(size_AAplus / 10000000), 0)                 AS "AA+_cr",
        COALESCE(ROUND(size_AA / 10000000), 0)                     AS "AA_cr",
        COALESCE(ROUND(size_AAminus / 10000000), 0)                AS "AA-_cr",
        COALESCE(ROUND(size_Aplus / 10000000), 0)                  AS "A+_cr",
        COALESCE(ROUND(size_A_below_rated / 10000000), 0)          AS "A & below (Rated)_cr",
        COALESCE(ROUND(size_A_below_unrated / 10000000), 0)        AS "A & below & (Unrated)_cr",
        ROUND((issuer_count / (SELECT total_issuer_count FROM total_issuers)) * 100, 2) AS shares
      FROM categorized
      ORDER BY ord;
    `;

    const monthlyCompareList = `
      WITH monthly_2025 AS (
          SELECT 
              COUNT(DISTINCT issuer_master_id) AS issuers,
              COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issue_size,
              COUNT(isin) AS isins
          FROM isin_re_issuance
          WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
      ),
      monthly_2026 AS (
          SELECT 
              COUNT(DISTINCT issuer_master_id) AS issuers,
              COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issue_size,
              COUNT(isin) AS isins
          FROM isin_re_issuance
          WHERE allotment_date BETWEEN ? AND ? AND (is_visible = 1)
      )
      SELECT 'Issuers' AS metric_name, 
            m2025.issuers AS value_2025, 
            m2026.issuers AS value_2026,
            ROUND((m2026.issuers - m2025.issuers) / NULLIF(m2025.issuers, 0) * 100, 2) AS yoy_change_pct
      FROM monthly_2025 m2025, monthly_2026 m2026
      UNION ALL
      SELECT 'Issue Size', m2025.issue_size, m2026.issue_size,
            ROUND((m2026.issue_size - m2025.issue_size) / NULLIF(m2025.issue_size, 0) * 100, 2)
      FROM monthly_2025 m2025, monthly_2026 m2026
      UNION ALL
      SELECT 'ISINs', m2025.isins, m2026.isins,
            ROUND((m2026.isins - m2025.isins) / NULLIF(m2025.isins, 0) * 100, 2)
      FROM monthly_2025 m2025, monthly_2026 m2026;
    `;

    const topSectorsWithIssuers = `
        WITH
        -- 1. Total issue size per business sector (including unknown/null)
        sector_totals AS (
          SELECT
            ir.business_sector,
            SUM(ir.issue_size) AS total_size
          FROM isin_re_issuance ir
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY ir.business_sector
        ),

        -- 2. Rank only known sectors (exclude those without a valid master entry AND exclude literal 'Others')
        ranked_sectors AS (
          SELECT
            st.business_sector,
            st.total_size,
            ROW_NUMBER() OVER (ORDER BY st.total_size DESC) AS rn
          FROM sector_totals st
          INNER JOIN master_business_sector bs 
            ON st.business_sector = bs.code
          AND bs.description != 'Others'   -- 👈 exclude the literal 'Others' sector
        ),

        -- 3. Assign group name and order for ALL business_sectors (known + unknown + literal 'Others')
        sector_groups AS (
          -- Known sectors (excluding 'Others'): top 5 get description, rest become 'Others'
          SELECT
            rs.business_sector,
            CASE
              WHEN rs.rn <= 5 THEN bs.description
              ELSE 'Others'
            END AS sector_group_name,
            CASE
              WHEN rs.rn <= 5 THEN rs.rn
              ELSE 6
            END AS group_order,
            rs.total_size AS sector_total
          FROM ranked_sectors rs
          JOIN master_business_sector bs ON rs.business_sector = bs.code

          UNION ALL

          -- Literal 'Others' sector (if it exists in master) – always forced into 'Others' group
          SELECT
            st.business_sector,
            'Others' AS sector_group_name,
            6 AS group_order,
            st.total_size AS sector_total
          FROM sector_totals st
          INNER JOIN master_business_sector bs ON st.business_sector = bs.code
          WHERE bs.description = 'Others'

          UNION ALL

          -- Unknown sectors (business_sector not found in master or is 0/NULL)
          SELECT
            st.business_sector,
            'Others' AS sector_group_name,
            6 AS group_order,
            st.total_size AS sector_total
          FROM sector_totals st
          LEFT JOIN master_business_sector bs ON st.business_sector = bs.code
          WHERE bs.code IS NULL
            OR st.business_sector = 0
        ),

        -- 4. Total size per sector group (for the 'Others' group, sum of all non‑top sectors)
        group_totals AS (
          SELECT
            sector_group_name,
            SUM(sector_total) AS group_total,
            MIN(group_order) AS group_order
          FROM sector_groups
          GROUP BY sector_group_name
        ),

        -- 5. Main issuer‑level data for all sectors (top 5 + Others)
        main_issuer_data AS (
          SELECT
            sg.sector_group_name AS sector_name,
            id.issuer_name,
            ir.issuer_master_id,
            gt.group_total AS sector_total_issue_size,
            COALESCE(ROUND(SUM(ir.issue_size) / 10000000), 0) AS total_issue_size,
            COUNT(ir.isin) AS isin_count,
            gt.group_order
          FROM isin_re_issuance ir
          JOIN sector_groups sg ON ir.business_sector = sg.business_sector
          JOIN group_totals gt ON sg.sector_group_name = gt.sector_group_name
          INNER JOIN issuer_details id ON ir.issuer_master_id = id.id
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY
            sg.sector_group_name,
            id.issuer_name,
            ir.issuer_master_id,
            gt.group_total,
            gt.group_order
        ),

        -- 6. Aggregated tenure and coupon data per issuer (no sector filter)
        issuer_agg AS (
          SELECT
            ir.issuer_master_id,
            MIN(itd.tenure) AS tenure_min,
            MAX(itd.tenure) AS tenure_max,
            MAX(
              CASE
                WHEN icd.coupon_rate IS NOT NULL
                AND icd.coupon_rate NOT REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                THEN 1
                ELSE 0
              END
            ) AS has_market_linked,
            MIN(
              COALESCE(
                CASE
                  WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                  THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                  WHEN icd.coupon_rate IS NULL THEN 0
                  ELSE NULL
                END,
                0
              )
            ) AS min_numeric_coupon,
            MAX(
              COALESCE(
                CASE
                  WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                  THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                  WHEN icd.coupon_rate IS NULL THEN 0
                  ELSE NULL
                END,
                0
              )
            ) AS max_numeric_coupon,
            AVG(
              CASE
                WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                ELSE NULL
              END
            ) AS avg_coupon_rate
          FROM isin_re_issuance ir
          LEFT JOIN issuer_tenure_details itd ON ir.isin_id = itd.issuer_id
          LEFT JOIN issuer_coupon_details icd ON ir.isin_id = icd.issuer_id
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY ir.issuer_master_id
        )

      -- 7. Final output, sorted with top 5 sectors first, then "Others" at the end
      SELECT
        m.sector_name,
        m.issuer_name,
        m.total_issue_size,
        m.isin_count,
        a.tenure_min,
        a.tenure_max,
        CASE
          WHEN a.has_market_linked = 1 THEN 'Market-Linked Coupon'
          ELSE CAST(COALESCE(a.min_numeric_coupon, 0) AS CHAR)
        END AS coupon_min,
        CASE
          WHEN a.has_market_linked = 1 THEN 'Market-Linked Coupon'
          ELSE CAST(COALESCE(a.max_numeric_coupon, 0) AS CHAR)
        END AS coupon_max,
        COALESCE(a.avg_coupon_rate, 0) AS avg_coupon_rate
      FROM main_issuer_data m
      LEFT JOIN issuer_agg a ON m.issuer_master_id = a.issuer_master_id
      ORDER BY
        m.group_order ASC,
        m.total_issue_size DESC;
    `;

    const topRatingWithIssuers = `
          WITH issuer_agg AS (
          SELECT
              ir.issuer_master_id,
              id.issuer_name,
              CASE
                  WHEN mir.rating = 'AAA'  THEN 'AAA'
                  WHEN mir.rating = 'AA+'  THEN 'AA+'
                  WHEN mir.rating = 'AA'   THEN 'AA'
                  WHEN mir.rating = 'AA-'  THEN 'AA-'
                  WHEN mir.rating = 'A+'   THEN 'A+'
                  ELSE 'A&Below'
              END AS rating_bucket,
              COALESCE(ROUND(SUM(ir.issue_size) / 10000000), 0) AS total_issue_size,
              COUNT(ir.isin) AS isin_count
          FROM isin_re_issuance ir
          LEFT JOIN issuer_details id
              ON ir.issuer_master_id = id.id
          LEFT JOIN master_issuer_rating mir
              ON ir.isin_id = mir.issuer_id          -- relation as specified
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY
              ir.issuer_master_id,
              id.issuer_name,
              CASE
                  WHEN mir.rating = 'AAA'  THEN 'AAA'
                  WHEN mir.rating = 'AA+'  THEN 'AA+'
                  WHEN mir.rating = 'AA'   THEN 'AA'
                  WHEN mir.rating = 'AA-'  THEN 'AA-'
                  WHEN mir.rating = 'A+'   THEN 'A+'
                  ELSE 'A&Below'
              END
      ),

      tenure_issuer_agg AS (
          SELECT
              ir.issuer_master_id,
              MIN(itd.tenure) AS tenure_min,
              MAX(itd.tenure) AS tenure_max
          FROM isin_re_issuance ir
          LEFT JOIN issuer_tenure_details itd
              ON ir.isin_id = itd.issuer_id           -- relation as specified
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY ir.issuer_master_id
      ),

      coupon_issuer_agg AS (
          SELECT
              ir.issuer_master_id,
              -- flag if any coupon for this issuer is non‑numeric text
              MAX(
                  CASE
                      WHEN icd.coupon_rate IS NOT NULL
                      AND icd.coupon_rate NOT REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                      THEN 1
                      ELSE 0
                  END
              ) AS has_market_linked,
              -- minimum numeric coupon (NULL → 0, text → ignored)
              MIN(
                  COALESCE(
                      CASE
                          WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                          THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                          WHEN icd.coupon_rate IS NULL THEN 0
                          ELSE NULL
                      END,
                      0
                  )
              ) AS min_numeric_coupon,
              -- maximum numeric coupon (NULL → 0, text → ignored)
              MAX(
                  COALESCE(
                      CASE
                          WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                          THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                          WHEN icd.coupon_rate IS NULL THEN 0
                          ELSE NULL
                      END,
                      0
                  )
              ) AS max_numeric_coupon,
              -- average of numeric coupons only
              AVG(
                  CASE
                      WHEN icd.coupon_rate REGEXP '^[0-9]+(\\.[0-9]+)?%?$'
                      THEN CAST(REPLACE(REPLACE(icd.coupon_rate, '%', ''), ' ', '') AS DECIMAL(10,4))
                      ELSE NULL
                  END
              ) AS avg_coupon_rate
          FROM isin_re_issuance ir
          LEFT JOIN issuer_coupon_details icd
              ON ir.isin_id = icd.issuer_id           -- relation as specified
          WHERE ir.allotment_date BETWEEN ? AND ?
            AND ir.is_visible = 1
          GROUP BY ir.issuer_master_id
      )

      SELECT
          ia.rating_bucket,
          ia.issuer_name,
          ia.total_issue_size,
          ia.isin_count,
          ta.tenure_min,
          ta.tenure_max,
          CASE
              WHEN ca.has_market_linked = 1 THEN 'Market-Linked Coupon'
              ELSE CAST(COALESCE(ca.min_numeric_coupon, 0) AS CHAR)
          END AS coupon_min,
          CASE
              WHEN ca.has_market_linked = 1 THEN 'Market-Linked Coupon'
              ELSE CAST(COALESCE(ca.max_numeric_coupon, 0) AS CHAR)
          END AS coupon_max,
          COALESCE(ca.avg_coupon_rate, 0) AS avg_coupon_rate   -- included for completeness
      FROM issuer_agg ia
      LEFT JOIN tenure_issuer_agg ta
          ON ia.issuer_master_id = ta.issuer_master_id
      LEFT JOIN coupon_issuer_agg ca
          ON ia.issuer_master_id = ca.issuer_master_id
      ORDER BY
          CASE ia.rating_bucket
              WHEN 'AAA'  THEN 1
              WHEN 'AA+'  THEN 2
              WHEN 'AA'   THEN 3
              WHEN 'AA-'  THEN 4
              WHEN 'A+'   THEN 5
              ELSE 6
          END,
          ia.total_issue_size DESC;
    
    `;


    const Params = [cyStart, cyEnd];
    const prevParams = [pyStart, pyEnd, cyStart, cyEnd];
    const tripleParams = [cyStart, cyEnd, cyStart, cyEnd, cyStart, cyEnd];

    const [
      totalIssuersResult,
      totalIssueCountResult,
      topSectorNameQueryResult,
      totalIssueSizeResult,
      totalUniqueIssuersResult,
      topIssuerByIssueSizeResult,
      topIssuerByIssuerNumberResult,
      topRatingResult,
      issuerListResult,
      currentRatings,
      previousRatings,
      currentSectors,
      previousSectors,
      sectorAndRatingListResult,
      monthlyCompareListResult,
      topSectorsWithIssuersResult,
      topRatingWithIssuersResult
    ] = await Promise.all([
      prisma.$queryRawUnsafe(totalIssuers, ...Params),
      prisma.$queryRawUnsafe(totalIssueCount, ...Params),
      prisma.$queryRawUnsafe(topSectorNameQuery, ...Params),
      prisma.$queryRawUnsafe(totalIssueSize, ...Params),
      prisma.$queryRawUnsafe(totalUniqueIssuers, ...Params),
      prisma.$queryRawUnsafe(topIssuerByIssueSize, ...Params),
      prisma.$queryRawUnsafe(topIssuerByIssuerNumber, ...Params),
      prisma.$queryRawUnsafe(topRating, ...Params),
      prisma.$queryRawUnsafe(issuerList, ...Params),
      prisma.$queryRawUnsafe(ratingsList, cyStart, cyEnd),
      prisma.$queryRawUnsafe(ratingsList, pmStart, pmEnd),
      prisma.$queryRawUnsafe(sectorList, cyStart, cyEnd),
      prisma.$queryRawUnsafe(sectorList, pmStart, pmEnd),
      prisma.$queryRawUnsafe(sectorAndRatingList, ...Params),
      prisma.$queryRawUnsafe(monthlyCompareList, ...prevParams),
      prisma.$queryRawUnsafe(topSectorsWithIssuers, ...tripleParams),
      prisma.$queryRawUnsafe(topRatingWithIssuers, ...tripleParams)
    ]);

    const AvgIssueSizeResult = totalIssueSizeResult.length > 0 ? Number(totalIssueSizeResult[0]?.total_issue_size) / Number(totalIssuersResult[0]?.total_issuers || 1) : 0;

    const mergedRatings = new Map();
    const allBuckets = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A & below'];


    // --- Merge sector data: base on current month's categories ---

    // 1. Extract current month's top 5 sector names (exclude "Others")
    const currentTopSectors = currentSectors
      .filter(row => row.sector_name !== 'Others')
      .map(row => row.sector_name);

    // 2. Aggregate previous month's data into current month's categories
    const prevAggregated = new Map();

    // Initialize with zero values for each current category
    currentTopSectors.forEach(name => {
      prevAggregated.set(name, {
        isin_count_previous_month: 0,
        issuer_count_previous_month: 0,
        total_issue_size_previous_month: 0,
        shares_previous_month: 0
      });
    });
    prevAggregated.set('Others', {
      isin_count_previous_month: 0,
      issuer_count_previous_month: 0,
      total_issue_size_previous_month: 0,
      shares_previous_month: 0
    });

    // Fill aggregation from previous month's data
    previousSectors.forEach(row => {
      const sectorName = row.sector_name;
      // If the sector is in current top 5, keep its name; otherwise map to "Others"
      const category = currentTopSectors.includes(sectorName) ? sectorName : 'Others';
      const entry = prevAggregated.get(category);
      if (entry) {
        entry.isin_count_previous_month += Number(row.isin_count);
        entry.issuer_count_previous_month += Number(row.issuer_count);
        entry.total_issue_size_previous_month += Number(row.total_issue_size);
        // shares will be recalculated later
      }
    });

    // 3. Recalculate shares for previous month based on the new grouping
    let totalPrevIssuers = 0;
    for (let entry of prevAggregated.values()) {
      totalPrevIssuers += entry.issuer_count_previous_month;
    }
    for (let entry of prevAggregated.values()) {
      entry.shares_previous_month = totalPrevIssuers > 0
        ? (entry.issuer_count_previous_month / totalPrevIssuers) * 100
        : 0;
    }

    // 4. Build the final sectorListResult in the order of currentSectors
    const sectorListResult = currentSectors.map(row => {
      const name = row.sector_name;
      const currentEntry = {
        sector_name: name,
        isin_count_current_month: Number(row.isin_count),
        issuer_count_current_month: Number(row.issuer_count),
        total_issue_size_current_month: Number(row.total_issue_size),
        shares_current_month: Number(row.shares),
        isin_count_previous_month: 0,
        issuer_count_previous_month: 0,
        total_issue_size_previous_month: 0,
        shares_previous_month: 0
      };
      const prevEntry = prevAggregated.get(name);
      if (prevEntry) {
        currentEntry.isin_count_previous_month = prevEntry.isin_count_previous_month;
        currentEntry.issuer_count_previous_month = prevEntry.issuer_count_previous_month;
        currentEntry.total_issue_size_previous_month = prevEntry.total_issue_size_previous_month;
        currentEntry.shares_previous_month = prevEntry.shares_previous_month;
      }
      return currentEntry;
    });





    allBuckets.forEach(bucket => {
      mergedRatings.set(bucket, {
        rating_label: bucket,
        issuer_count_current_month: 0,
        total_issue_size_current_month: 0,
        shares_current_month: 0,
        issuer_count_previous_month: 0,
        total_issue_size_previous_month: 0,
        shares_previous_month: 0
      });
    });

    currentRatings.forEach(row => {
      const bucket = row.rating_label;
      if (mergedRatings.has(bucket)) {
        const entry = mergedRatings.get(bucket);
        entry.issuer_count_current_month = Number(row.issuer_count);
        entry.total_issue_size_current_month = Number(row.total_issue_size);
        entry.shares_current_month = Number(row.shares);
      }
    });

    previousRatings.forEach(row => {
      const bucket = row.rating_label;
      if (mergedRatings.has(bucket)) {
        const entry = mergedRatings.get(bucket);
        entry.issuer_count_previous_month = Number(row.issuer_count);
        entry.total_issue_size_previous_month = Number(row.total_issue_size);
        entry.shares_previous_month = Number(row.shares);
      }
    });

    const ratingsListResult = Array.from(mergedRatings.values());

    /* ---------------- RESPONSE ---------------- */

    return res.status(200).json({
      totalIssuersResult,
      totalIssueCountResult,
      topSectorNameQueryResult,
      totalIssueSizeResult,
      AvgIssueSizeResult,
      totalUniqueIssuersResult,
      topIssuerByIssueSizeResult,
      topIssuerByIssuerNumberResult,
      topRatingResult,
      issuerListResult,
      ratingsListResult,
      sectorListResult,
      sectorAndRatingListResult,
      monthlyCompareListResult,
      topSectorsWithIssuersResult,
      topRatingWithIssuersResult
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch market snapshot data',
      message: error.message
    });
  }
});


//upload re-issuance data
app.post('/bulk-upsert', async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: '"data" must be an array' });
    }

    const checkNumber = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const parseDate = (value) => {
      if (!value) return null;

      // Handle Excel serial numbers (e.g. 46184 → 2026-06-10)
      const num = Number(value);
      if (!isNaN(num) && num > 30000 && num < 100000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const days = num > 60 ? num - 1 : num; // adjust for Excel 1900 leap-year bug
        const result = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
        return new Date(Date.UTC(result.getFullYear(), result.getMonth(), result.getDate()));
      }

      // Handle ISO / standard date strings
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      }

      return null;
    };

    const results = [];

    for (const item of data) {
      const txResult = await prisma.$transaction(async (tx) => {
        if (!item.isin?.trim()) {
          throw new Error("ISIN is required");
        }

        const formattedAllotmentDate = parseDate(item.allotmentDate);
        const formattedMaturityDate = parseDate(item.maturityDate);
        const formattedBiddingDate = parseDate(item.biddingDate);

        // --- Lookup master_issuer for isin_id FK (read-only) ---
        const masterIssuer = await tx.master_issuer.findFirst({
          where: { isin: item.isin.trim() }
        });

        // --- Lookup issuer_details for issuer_master_id FK (read-only) ---
        let issuerDetails = null;
        if (item.issuerName?.trim()) {
          issuerDetails = await tx.issuer_details.findFirst({
            where: {
              issuer_name: {
                contains: item.issuerName.trim()
              }
            }
          });
        }

        // --- Resolve secured_flag code from description ---
        let securedFlagRecord = null;
        if (item.securedUnsecured?.trim()) {
          securedFlagRecord = await tx.master_secured_flag.findFirst({
            where: {
              description: {
                contains: item.securedUnsecured.trim()
              }
            }
          });
        }

        // --- Check if ISIN already exists in isin_re_issuance ---
        const existingReIssuance = await tx.isin_re_issuance.findFirst({
          where: { isin: item.isin.trim() }
        });

        let reIssuanceResult;
        let detailsResult;

        const couponFrequencyRecord = await tx.master_coupon_type.findFirst({
          where: {
            description: {
              contains: item.couponFrequency.trim()
            }
          }
        });

        // ==================================
        // UPDATE BRANCH
        // ==================================
        if (existingReIssuance) {
          const reIssuanceId = existingReIssuance.id;

          // 1. Update isin_re_issuance
          reIssuanceResult = await tx.isin_re_issuance.update({
            where: { id: reIssuanceId },
            data: {
              isin_id:
                masterIssuer?.id !== undefined && masterIssuer?.id !== null
                  ? BigInt(masterIssuer.id)
                  : existingReIssuance.isin_id,
              issuer_master_id:
                issuerDetails?.id !== undefined && issuerDetails?.id !== null
                  ? BigInt(issuerDetails.id)
                  : existingReIssuance.issuer_master_id,
              allotment_date: formattedAllotmentDate,
              issue_size: checkNumber(item.baseIssueSize),
              face_value: checkNumber(item.faceValue),
              maturity_date: formattedMaturityDate,
              secured_flag: securedFlagRecord
                ? Number(securedFlagRecord.code)
                : existingReIssuance.secured_flag,
              is_updated: 1,
              updated_at: new Date()
            }
          });

          // 2. Build details payload
          const detailsPayload = {
            bidding_date: formattedBiddingDate,
            issuer_name: item.issuerName ?? null,
            isin: item.isin ?? null,
            issue_description: item.issueDescription ?? null,
            type_of_issuance: item.typeOfIssuance ?? null,
            allotment_date: formattedAllotmentDate,
            face_value: checkNumber(item.faceValue),
            credit_rating: item.creditRating ?? null,
            type_of_book_bidding: String(item.typeOfBookBidding)?.toLocaleLowerCase() ?? null,   // Enum
            price: checkNumber(item.price),
            spread: checkNumber(item.spread),
            yield: checkNumber(item.yield),
            manner_of_allotment: item.mannerOfAllotment ?? null,
            manner_of_settlement: item.mannerOfSettlement ?? null,
            link_of_gid_ppm: item.linkOfGidPpm ?? null,
            link_of_kid_term_sheet: item.linkOfKidTermSheet ?? null,
            base_issue_size: checkNumber(item.baseIssueSize),
            green_shoe_option: checkNumber(item.greenShoeOption),
            amount_raised: checkNumber(item.amountRaised),
            coupon: checkNumber(item.coupon),
            // Int column
            coupon_frequency: couponFrequencyRecord?.code
              ? Number(couponFrequencyRecord.code)
              : null,
            successful_bidders_category: item.successfulBiddersCategory ?? null,
            type_of_bidding: item.typeOfBidding ?? null,
            // Enum
            secured_unsecured: String(item.securedUnsecured)?.toLocaleLowerCase() ?? null,
            tenor: item.tenor ?? null,
            maturity_type: item.maturityType ?? null,
            interest_payment_type: item.interestPaymentType ?? null,
            anchor_amount: checkNumber(item.anchorAmount),
            number_of_anchor_investors: checkNumber(item.numberOfAnchorInvestors),
            total_qib_bidding: checkNumber(item.totalQibBidding),
            total_qib_amount_accepted: checkNumber(item.totalQibAmountAccepted),
            total_non_qib_bidding: checkNumber(item.totalNonQibBidding),
            total_non_qib_amount_accepted: checkNumber(item.totalNonQibAmountAccepted),
            cutoff_yield_price: checkNumber(item.cutoffYieldPrice),
            weighted_average_cutoff_yield_price: checkNumber(item.weightedAverageCutoffYieldPrice),
            // String column
            issuance_done_through_bidding_process:
              item.issuanceDoneThroughBiddingProcess != null
                ? String(item.issuanceDoneThroughBiddingProcess)
                : null,
            updated_at: new Date()
          };

          // 3. Upsert isin_re_issuance_details
          const existingDetails = await tx.isin_re_issuance_details.findFirst({
            where: { re_issuance_id: reIssuanceId }
          });

          if (existingDetails) {
            detailsResult = await tx.isin_re_issuance_details.update({
              where: { id: existingDetails.id },
              data: detailsPayload
            });
          } else {
            detailsResult = await tx.isin_re_issuance_details.create({
              data: { re_issuance_id: reIssuanceId, ...detailsPayload }
            });
          }

          return {
            isin: item.isin,
            action: 'updated',
            reIssuance: reIssuanceResult,
            details: detailsResult,
            securedFlag: securedFlagRecord
          };
        }

        // ==================================
        // INSERT BRANCH
        // ==================================
        else {
          // 1. Create isin_re_issuance
          // 1. Create isin_re_issuance
          reIssuanceResult = await tx.isin_re_issuance.create({
            data: {
              isin: item.isin.trim(),
              // Required BigInt fields
              isin_id: BigInt(masterIssuer.id),
              issuer_master_id: BigInt(issuerDetails.id),
              // Required fields
              allotment_date: formattedAllotmentDate,
              issue_size: checkNumber(item.baseIssueSize),
              // Optional fields
              face_value: checkNumber(item.faceValue),
              maturity_date: formattedMaturityDate,
              secured_flag: securedFlagRecord
                ? Number(securedFlagRecord.code)
                : null,
              is_visible: 1,
              is_updated: 0,
              is_main:
                item.typeOfIssuance?.trim().toLowerCase() === "re-issuance"
                  ? 0
                  : 1,
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          const reIssuanceId = reIssuanceResult.id;

          // 2. Create isin_re_issuance_details
          detailsResult = await tx.isin_re_issuance_details.create({
            data: {
              re_issuance_id: BigInt(reIssuanceId),
              bidding_date: formattedBiddingDate,
              issuer_name: item.issuerName ?? null,
              isin: item.isin ?? null,
              issue_description: item.issueDescription ?? null,
              type_of_issuance: item.typeOfIssuance ?? null,
              allotment_date: formattedAllotmentDate,
              face_value: checkNumber(item.faceValue),
              credit_rating: item.creditRating ?? null,
              // Enum value
              type_of_book_bidding: String(item.typeOfBookBidding)?.toLocaleLowerCase() ?? null,
              price: checkNumber(item.price),
              spread: checkNumber(item.spread),
              yield: checkNumber(item.yield),
              manner_of_allotment: item.mannerOfAllotment ?? null,
              manner_of_settlement: item.mannerOfSettlement ?? null,
              link_of_gid_ppm: item.linkOfGidPpm ?? null,
              link_of_kid_term_sheet: item.linkOfKidTermSheet ?? null,
              base_issue_size: checkNumber(item.baseIssueSize),
              green_shoe_option: checkNumber(item.greenShoeOption),
              amount_raised: checkNumber(item.amountRaised),
              coupon: checkNumber(item.coupon),
              // Int column (replace with your lookup if you have one)
              coupon_frequency: couponFrequencyRecord
                ? Number(couponFrequencyRecord.code)
                : null,
              successful_bidders_category: item.successfulBiddersCategory ?? null,
              type_of_bidding: item.typeOfBidding ?? null,
              // Enum value
              secured_unsecured: String(item.securedUnsecured)?.toLocaleLowerCase() ?? null,
              tenor: item.tenor ?? null,
              maturity_type: item.maturityType ?? null,
              interest_payment_type: item.interestPaymentType ?? null,
              anchor_amount: checkNumber(item.anchorAmount),
              number_of_anchor_investors: checkNumber(item.numberOfAnchorInvestors),
              total_qib_bidding: checkNumber(item.totalQibBidding),
              total_qib_amount_accepted: checkNumber(item.totalQibAmountAccepted),
              total_non_qib_bidding: checkNumber(item.totalNonQibBidding),
              total_non_qib_amount_accepted: checkNumber(item.totalNonQibAmountAccepted),
              cutoff_yield_price: checkNumber(item.cutoffYieldPrice),
              weighted_average_cutoff_yield_price: checkNumber(item.weightedAverageCutoffYieldPrice),
              issuance_done_through_bidding_process:
                item.issuanceDoneThroughBiddingProcess != null
                  ? String(item.issuanceDoneThroughBiddingProcess)
                  : null,
              created_at: new Date(),
              updated_at: new Date()
            }
          });

          return {
            isin: item.isin,
            action: 'inserted',
            reIssuance: reIssuanceResult,
            details: detailsResult,
            securedFlag: securedFlagRecord
          };
        }
      });

      results.push(txResult);
    }

    return res.json({ success: true, processed: results.length, results });

  } catch (err) {
    console.error('Bulk upsert error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
// upload arrangers bulk
app.post('/bulk-arrangers', async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: '"data" must be an array' });
    }

    const results = [];

    for (const item of data) {
      const txResult = await prisma.$transaction(async (tx) => {
        if (!item.isin?.trim()) {
          throw new Error("ISIN is required");
        }

        if (!item.arrangerDetailsArranger?.trim()) {
          throw new Error("arrangerDetailsArranger is required");
        }

        const trimmedIsin = item.isin.trim();
        const trimmedArranger = item.arrangerDetailsArranger.trim();

        // --- Find the issuer by ISIN ---
        const issuers = await tx.$queryRawUnsafe(`
          SELECT id FROM master_issuer WHERE isin = '${trimmedIsin}' LIMIT 1
        `);

        if (!issuers || issuers.length === 0) {
          throw new Error(`Issuer not found for ISIN: ${trimmedIsin}`);
        }

        const issuerId = issuers[0].id;

        // --- Find or create the arranger in master_arranger ---
        const arrangers = await tx.$queryRawUnsafe(`
          SELECT id FROM master_arranger WHERE short_name LIKE '%${trimmedArranger}%' LIMIT 1
        `);

        let arrangerId;

        if (arrangers && arrangers.length > 0) {
          console.log('already exited arranger');

          arrangerId = arrangers[0].id;
        } else {
          // Create new arranger if not found
          console.log('no master arranger named', trimmedArranger, 'found need to create');

          await tx.$queryRawUnsafe(`
            INSERT INTO master_arranger (short_name, arranger_name)
            VALUES ('${trimmedArranger}', '${trimmedArranger}')
          `);

          // Fetch back the newly created arranger to get its id
          const newArrangers = await tx.$queryRawUnsafe(`
            SELECT id FROM master_arranger WHERE short_name = '${trimmedArranger}' LIMIT 1
          `);

          arrangerId = newArrangers[0].id;
        }

        console.log(`arrangerId: ${arrangerId} and issuerId: ${issuerId}`);

        if (arrangerId && issuerId) {
          // --- Check if the issuer-arranger relation already exists ---
          const existingRelations = await tx.$queryRawUnsafe(`
            SELECT issuer_id, arranger_id FROM issuer_arranger 
            WHERE issuer_id = ${issuerId} AND arranger_id = ${arrangerId} 
            LIMIT 1
          `);

          if (existingRelations && existingRelations.length > 0) {
            // Relation already exists — no update needed
            console.log('already exists the issuerId: ', issuerId, 'and arrangerId', arrangerId);

            relationResult = {
              action: 'existing',
              data: existingRelations[0]
            };
          } else {
            // Create new issuer-arranger relation
            console.log('no issuer arranger present, create one');

            await tx.$queryRawUnsafe(`
              INSERT INTO issuer_arranger (issuer_id, arranger_id)
              VALUES (${issuerId}, ${arrangerId})
            `);

            relationResult = {
              action: 'inserted',
              data: { issuer_id: issuerId, arranger_id: arrangerId }
            };
          }
        } else {
          return {
            status: 'no arranger id'
          };
        }

        return {
          isin: trimmedIsin,
          arrangerId: arrangerId
        };
      });

      results.push(txResult);
    }

    return res.json({
      success: true,
      processed: results.length,
      results
    });

  } catch (err) {
    console.error('Bulk upsert arrangers error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// merge arrangers 
app.post('/merge-arrangers', async (req, res) => {
  try {
    const { mainArrangerId, mergeArrangerIds } = req.body;

    // ─── Step 1: Validate Request ──────────────────────────────────────
    if (!mainArrangerId || typeof mainArrangerId !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'mainArrangerId is required and must be a number'
      });
    }

    if (!Array.isArray(mergeArrangerIds) || mergeArrangerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'mergeArrangerIds must be a non-empty array'
      });
    }

    if (mergeArrangerIds.includes(mainArrangerId)) {
      return res.status(400).json({
        success: false,
        message: 'mergeArrangerIds cannot include the mainArrangerId'
      });
    }

    const mergeIdsString = mergeArrangerIds.join(', ');

    // ─── Execute everything inside a single Prisma transaction ───────
    const result = await prisma.$transaction(async (tx) => {

      // ── Step 1b: Verify main arranger exists ──────────────────────
      const mainArrangers = await tx.$queryRawUnsafe(`
        SELECT id, arranger_name, parent_id 
        FROM master_arranger 
        WHERE id = ${mainArrangerId} 
        LIMIT 1
      `);

      if (!mainArrangers || mainArrangers.length === 0) {
        throw new Error(`Main arranger with id ${mainArrangerId} not found`);
      }

      const parentId = parseInt(mainArrangers[0].parent_id, 10) || 0;

      if (parentId !== 0) {
        throw new Error(`Cannot merge into arranger ${mainArrangerId} because it is already merged into arranger ${parentId}`);
      }

      // ── Step 2: Update duplicate arrangers' parent_id ─────────────
      await tx.$queryRawUnsafe(`
        UPDATE master_arranger 
        SET parent_id = ${mainArrangerId} 
        WHERE id IN (${mergeIdsString})
      `);

      // ── Step 3: Fetch ALL issuer_arranger records to be migrated ──
      // Get full rows (issuer_id + arranger_id) not just distinct
      const mappingsToMigrate = await tx.$queryRawUnsafe(`
        SELECT issuer_id, arranger_id 
        FROM issuer_arranger 
        WHERE arranger_id IN (${mergeIdsString})
      `);

      if (!mappingsToMigrate || mappingsToMigrate.length === 0) {
        return {
          mainArrangerId,
          mergedArrangers: mergeArrangerIds,
          migratedMappings: 0,
          skippedDuplicates: 0,
          updatedIssuers: []
        };
      }

      const affectedIssuerIds = [];
      let skippedDuplicates = 0;

      // ── Steps 4-7: Process each mapping individually ──────────────
      for (const mapping of mappingsToMigrate) {
        const { issuer_id, arranger_id: oldArrangerId } = mapping;

        // Collect unique affected issuer IDs for Step 8
        if (!affectedIssuerIds.includes(issuer_id)) {
          affectedIssuerIds.push(issuer_id);
        }

        // Step 5: Delete the old mapping
        await tx.$queryRawUnsafe(`
          DELETE FROM issuer_arranger 
          WHERE issuer_id = ${issuer_id} 
          AND arranger_id = ${oldArrangerId}
        `);

        // Step 7: Check if new mapping already exists
        const existingMapping = await tx.$queryRawUnsafe(`
          SELECT issuer_id, arranger_id 
          FROM issuer_arranger 
          WHERE issuer_id = ${issuer_id} 
          AND arranger_id = ${mainArrangerId} 
          LIMIT 1
        `);

        if (existingMapping && existingMapping.length > 0) {
          // Duplicate exists — skip insert
          skippedDuplicates++;
        } else {
          // Step 6: Create new mapping
          await tx.$queryRawUnsafe(`
            INSERT INTO issuer_arranger (issuer_id, arranger_id) 
            VALUES (${issuer_id}, ${mainArrangerId})
          `);
        }
      }

      // ── Step 8: Update master_issuer.is_updated for all affected ──
      if (affectedIssuerIds.length > 0) {
        const issuerIdsString = affectedIssuerIds.join(', ');

        await tx.$queryRawUnsafe(`
          UPDATE master_issuer 
          SET is_updated = true 
          WHERE id IN (${issuerIdsString})
        `);
      }

      return {
        mainArrangerId,
        mergedArrangers: mergeArrangerIds,
        migratedMappings: mappingsToMigrate.length,
        skippedDuplicates,
        updatedIssuers: affectedIssuerIds
      };

    }, {
      maxWait: 10000,
      timeout: 60000  // Increased to 60 seconds for large datasets
    });

    return res.status(200).json({
      success: true,
      message: 'Arrangers merged successfully',
      data: result
    });

  } catch (err) {
    console.error('Merge arrangers error:', err);

    const statusCode = err.message?.includes('not found') ||
      err.message?.includes('Cannot merge')
      ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Internal server error during merge operation'
    });
  }
});

// ─── API: Get Similar Arrangers ────────────────────────────────────
app.get('/arrangers/similar/:arrangerId', async (req, res) => {
  try {
    const { arrangerId } = req.params;
    const { threshold = 50 } = req.query; // default 50% similarity

    const similarityThreshold = parseFloat(threshold);
    if (isNaN(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 100) {
      return res.status(400).json({
        success: false,
        message: 'threshold must be a number between 0 and 100'
      });
    }

    const arrangerIdNum = parseInt(arrangerId, 10);
    if (isNaN(arrangerIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'arrangerId must be a valid number'
      });
    }

    // ── Step 1: Fetch the main arranger ───────────────────────────
    const mainArrangers = await prisma.$queryRawUnsafe(`
      SELECT id, short_name, arranger_name, parent_id
      FROM master_arranger
      WHERE id = ${arrangerIdNum}
      LIMIT 1
    `);

    if (!mainArrangers || mainArrangers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Arranger with id ${arrangerIdNum} not found`
      });
    }

    const mainArranger = mainArrangers[0];
    const mainName = mainArranger.short_name || mainArranger.arranger_name;

    if (!mainName || !mainName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Main arranger has no name to compare against'
      });
    }

    // ── Step 2: Fetch all other arrangers (exclude main + already merged) ─
    const allArrangers = await prisma.$queryRawUnsafe(`
      SELECT id, short_name, arranger_name, parent_id
      FROM master_arranger
      WHERE id != ${arrangerIdNum}
      AND parent_id = 0
      ORDER BY short_name ASC
    `);

    if (!allArrangers || allArrangers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No other arrangers found to compare',
        data: {
          mainArranger: {
            id: mainArranger.id,
            name: mainName,
            short_name: mainArranger.short_name,
            arranger_name: mainArranger.arranger_name
          },
          similarArrangers: [],
          totalFound: 0
        }
      });
    }

    // ── Step 3: Calculate similarity for each arranger ────────────
    const similarArrangers = [];

    for (const arranger of allArrangers) {
      const compareName = arranger.arranger_name || arranger.short_name;

      if (!compareName || !compareName.trim()) continue;

      const similarity = getCombinedSimilarity(mainName, compareName);

      if (similarity >= similarityThreshold) {
        similarArrangers.push({
          id: arranger.id,
          name: compareName,
          short_name: arranger.short_name,
          arranger_name: arranger.arranger_name,
          similarity: parseFloat(similarity.toFixed(2)),
          similarityFormatted: `${similarity.toFixed(2)}%`
        });
      }
    }

    // ── Step 4: Sort by similarity (highest first) ────────────────
    similarArrangers.sort((a, b) => b.similarity - a.similarity);

    return res.status(200).json({
      success: true,
      message: `Found ${similarArrangers.length} similar arrangers`,
      data: {
        mainArranger: {
          id: mainArranger.id,
          name: mainName,
          short_name: mainArranger.short_name,
          arranger_name: mainArranger.arranger_name
        },
        similarArrangers,
        totalFound: similarArrangers.length,
        threshold: similarityThreshold
      }
    });

  } catch (err) {
    console.error('Get similar arrangers error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
});

app.post('/admin-arrangers', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.body;

    // Validate pagination params
    const take = parseInt(limit, 10);
    const skip = parseInt(offset, 10);

    if (isNaN(take) || take < 1) {
      return res.status(400).json({ error: 'Invalid limit. Must be a positive number.' });
    }
    if (isNaN(skip) || skip < 0) {
      return res.status(400).json({ error: 'Invalid offset. Must be a non-negative number.' });
    }

    // Fetch paginated data
    const arrangers = await prisma.$queryRawUnsafe(`
          SELECT 
              master_arranger.id, 
              master_arranger.arranger_name, 
              MAX(master_contact.contact_person) AS contact_person, 
              MAX(master_contact.contact_no) AS contact_no, 
              MAX(master_contact.email_id) AS email_id, 
              master_arranger.smt_status, 
              master_arranger.is_active, 
              master_arranger.website 
          FROM master_arranger 
          LEFT JOIN master_contact 
              ON master_contact.master_id = master_arranger.id 
              AND master_contact.type = 1 
          WHERE master_arranger.parent_id = 0 
          GROUP BY 
              master_arranger.id,
              master_arranger.arranger_name,
              master_arranger.smt_status,
              master_arranger.is_active,
              master_arranger.website
          ORDER BY master_arranger.arranger_name ASC
          LIMIT ${take} OFFSET ${skip}
        `);

    // Fetch total count for pagination metadata
    const countResult = await prisma.$queryRaw`
            SELECT COUNT(*) as total 
            FROM master_arranger 
            WHERE parent_id = 0
        `;
    const total = parseInt(countResult[0].total, 10);

    return res.json({
      success: true,
      data: arrangers,
      pagination: {
        total,
        limit: take,
        offset: skip,
        hasMore: skip + arrangers.length < total
      }
    });

  } catch (error) {
    console.error('Error fetching arrangers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch arrangers'
    });
  }

})

app.post('/admin-trustees', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.body;

    // Validate pagination params
    const take = parseInt(limit, 10);
    const skip = parseInt(offset, 10);

    if (isNaN(take) || take < 1) {
      return res.status(400).json({ error: 'Invalid limit. Must be a positive number.' });
    }
    if (isNaN(skip) || skip < 0) {
      return res.status(400).json({ error: 'Invalid offset. Must be a non-negative number.' });
    }

    // Fetch paginated data
    const trustees = await prisma.$queryRawUnsafe(`
            SELECT 
              id,
              trustee_name,
              short_name,
              trustshpd,
              website,
              is_active,
              is_deleted,
              parent_id
            FROM master_trustee
            WHERE parent_id = 0
            LIMIT ${take} OFFSET ${skip}
        `);

    // Fetch total count for pagination metadata
    const countResult = await prisma.$queryRaw`
        SELECT COUNT(*) as total 
        FROM master_trustee 
        WHERE parent_id = 0
    `;
    const total = parseInt(countResult[0].total, 10);

    return res.json({
      success: true,
      data: trustees,
      pagination: {
        total,
        limit: take,
        offset: skip,
        hasMore: skip + trustees.length < total
      }
    });

  } catch (error) {
    console.error('Error fetching trustees:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch trustees'
    });
  }

})

app.get('/trustees/similar/:trusteeId', async (req, res) => {
  try {
    const { trusteeId } = req.params;
    const { threshold = 50 } = req.query; // default 50% similarity

    const similarityThreshold = parseFloat(threshold);
    if (isNaN(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 100) {
      return res.status(400).json({
        success: false,
        message: 'threshold must be a number between 0 and 100'
      });
    }

    const trusteeIdNum = parseInt(trusteeId, 10);
    if (isNaN(trusteeIdNum)) {
      return res.status(400).json({
        success: false,
        message: 'trusteeId must be a valid number'
      });
    }

    // ── Step 1: Fetch the main trustee ───────────────────────────
    const mainTrustees = await prisma.$queryRawUnsafe(`
      SELECT id, short_name, trustee_name, trustshpd, website, is_active, is_deleted, parent_id
      FROM master_trustee
      WHERE id = ${trusteeIdNum}
      LIMIT 1
    `);

    if (!mainTrustees || mainTrustees.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Trustee with id ${trusteeIdNum} not found`
      });
    }

    const mainTrustee = mainTrustees[0];
    const mainName = mainTrustee.short_name || mainTrustee.trustee_name;

    if (!mainName || !mainName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Main trustee has no name to compare against'
      });
    }

    // ── Step 2: Fetch all other trustees (exclude main + already merged) ─
    const allTrustees = await prisma.$queryRawUnsafe(`
      SELECT id, short_name, trustee_name, trustshpd, website, is_active, is_deleted, parent_id
      FROM master_trustee
      WHERE id != ${trusteeIdNum}
      AND parent_id = 0
      ORDER BY short_name ASC
    `);

    if (!allTrustees || allTrustees.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No other trustees found to compare',
        data: {
          mainTrustee: {
            id: mainTrustee.id,
            name: mainName,
            short_name: mainTrustee.short_name,
            trustee_name: mainTrustee.trustee_name,
            trustshpd: mainTrustee.trustshpd,
            website: mainTrustee.website,
            is_active: mainTrustee.is_active,
            is_deleted: mainTrustee.is_deleted
          },
          similarTrustees: [],
          totalFound: 0
        }
      });
    }

    // ── Step 3: Calculate similarity for each trustee ────────────
    const similarTrustees = [];

    for (const trustee of allTrustees) {
      const compareName = trustee.trustee_name || trustee.short_name;

      if (!compareName || !compareName.trim()) continue;

      const similarity = getCombinedSimilarity(mainName, compareName);

      if (similarity >= similarityThreshold) {
        similarTrustees.push({
          id: trustee.id,
          name: compareName,
          short_name: trustee.short_name,
          trustee_name: trustee.trustee_name,
          trustshpd: trustee.trustshpd,
          website: trustee.website,
          is_active: trustee.is_active,
          is_deleted: trustee.is_deleted,
          similarity: parseFloat(similarity.toFixed(2)),
          similarityFormatted: `${similarity.toFixed(2)}%`
        });
      }
    }

    // ── Step 4: Sort by similarity (highest first) ────────────────
    similarTrustees.sort((a, b) => b.similarity - a.similarity);

    return res.status(200).json({
      success: true,
      message: `Found ${similarTrustees.length} similar trustees`,
      data: {
        mainTrustee: {
          id: mainTrustee.id,
          name: mainName,
          short_name: mainTrustee.short_name,
          trustee_name: mainTrustee.trustee_name,
          trustshpd: mainTrustee.trustshpd,
          website: mainTrustee.website,
          is_active: mainTrustee.is_active,
          is_deleted: mainTrustee.is_deleted
        },
        similarTrustees,
        totalFound: similarTrustees.length,
        threshold: similarityThreshold
      }
    });

  } catch (err) {
    console.error('Get similar trustees error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
});

app.post('/merge-trustees', async (req, res) => {
  try {
    const { mainTrusteeId, mergeTrusteeIds } = req.body;

    // ─── Step 1: Validate Request ──────────────────────────────────────
    if (!mainTrusteeId || typeof mainTrusteeId !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'mainTrusteeId is required and must be a number'
      });
    }

    if (!Array.isArray(mergeTrusteeIds) || mergeTrusteeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'mergeTrusteeIds must be a non-empty array'
      });
    }

    if (mergeTrusteeIds.includes(mainTrusteeId)) {
      return res.status(400).json({
        success: false,
        message: 'mergeTrusteeIds cannot include the mainTrusteeId'
      });
    }

    const mergeIdsString = mergeTrusteeIds.join(', ');

    // ─── Execute everything inside a single Prisma transaction ───────
    const result = await prisma.$transaction(async (tx) => {

      // ── Step 1b: Verify main trustee exists ──────────────────────
      const mainTrustees = await tx.$queryRawUnsafe(`
        SELECT id, trustee_name, parent_id 
        FROM master_trustee 
        WHERE id = ${mainTrusteeId} 
        LIMIT 1
      `);

      if (!mainTrustees || mainTrustees.length === 0) {
        throw new Error(`Main trustee with id ${mainTrusteeId} not found`);
      }

      const parentId = parseInt(mainTrustees[0].parent_id, 10) || 0;

      if (parentId !== 0) {
        throw new Error(`Cannot merge into trustee ${mainTrusteeId} because it is already merged into trustee ${parentId}`);
      }

      // ── Step 2: Update duplicate trustees' parent_id ─────────────
      await tx.$queryRawUnsafe(`
        UPDATE master_trustee 
        SET parent_id = ${mainTrusteeId} 
        WHERE id IN (${mergeIdsString})
      `);

      // ── Step 3: Fetch ALL issuer_trustee records to be migrated ──
      // Get full rows (issuer_id + trustee_id) not just distinct
      const mappingsToMigrate = await tx.$queryRawUnsafe(`
        SELECT issuer_id, trustee_id 
        FROM issuer_trustee 
        WHERE trustee_id IN (${mergeIdsString})
      `);

      if (!mappingsToMigrate || mappingsToMigrate.length === 0) {
        return {
          mainTrusteeId,
          mergedTrustees: mergeTrusteeIds,
          migratedMappings: 0,
          skippedDuplicates: 0,
          updatedIssuers: []
        };
      }

      const affectedIssuerIds = [];
      let skippedDuplicates = 0;

      // ── Steps 4-7: Process each mapping individually ──────────────
      for (const mapping of mappingsToMigrate) {
        const { issuer_id, trustee_id: oldTrusteeId } = mapping;

        // Collect unique affected issuer IDs for Step 8
        if (!affectedIssuerIds.includes(issuer_id)) {
          affectedIssuerIds.push(issuer_id);
        }

        // Step 5: Delete the old mapping
        await tx.$queryRawUnsafe(`
          DELETE FROM issuer_trustee 
          WHERE issuer_id = ${issuer_id} 
          AND trustee_id = ${oldTrusteeId}
        `);

        // Step 7: Check if new mapping already exists
        const existingMapping = await tx.$queryRawUnsafe(`
          SELECT issuer_id, trustee_id 
          FROM issuer_trustee 
          WHERE issuer_id = ${issuer_id} 
          AND trustee_id = ${mainTrusteeId} 
          LIMIT 1
        `);

        if (existingMapping && existingMapping.length > 0) {
          // Duplicate exists — skip insert
          skippedDuplicates++;
        } else {
          // Step 6: Create new mapping
          await tx.$queryRawUnsafe(`
            INSERT INTO issuer_trustee (issuer_id, trustee_id) 
            VALUES (${issuer_id}, ${mainTrusteeId})
          `);
        }
      }

      // ── Step 8: Update master_issuer.is_updated for all affected ──
      if (affectedIssuerIds.length > 0) {
        const issuerIdsString = affectedIssuerIds.join(', ');

        await tx.$queryRawUnsafe(`
          UPDATE master_issuer 
          SET is_updated = true 
          WHERE id IN (${issuerIdsString})
        `);
      }

      return {
        mainTrusteeId,
        mergedTrustees: mergeTrusteeIds,
        migratedMappings: mappingsToMigrate.length,
        skippedDuplicates,
        updatedIssuers: affectedIssuerIds
      };

    }, {
      maxWait: 10000,
      timeout: 60000  // Increased to 60 seconds for large datasets
    });

    return res.status(200).json({
      success: true,
      message: 'Trustees merged successfully',
      data: result
    });

  } catch (err) {
    console.error('Merge trustees error:', err);

    const statusCode = err.message?.includes('not found') ||
      err.message?.includes('Cannot merge')
      ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      message: err.message || 'Internal server error during merge operation'
    });
  }
});


//updated Dashoard APIs DONE

app.get('/dashboard_issue_volume_trends_data', async (req, res) => {
  try {
    const startDate = '1987-04-01 00:00:00';
    const endDate = formatDate(new Date());

    const result = await prisma.$queryRaw`
    SELECT
    CONCAT(
        CASE 
            WHEN MONTH(allotment_date) < 4 THEN YEAR(allotment_date) - 1 
            ELSE YEAR(allotment_date) 
        END,
        '-',
        CASE 
            WHEN MONTH(allotment_date) < 4 THEN YEAR(allotment_date) 
            ELSE YEAR(allotment_date) + 1 
        END
    ) AS years,
    ROUND(SUM(issue_size) / 10000000, 2) AS total_issue_size_cr,
    COUNT(isin) AS total_no_of_issues
    FROM
        isin_re_issuance
    WHERE
        allotment_date BETWEEN ${startDate} AND ${endDate} AND (is_visible = 1)
    GROUP BY
        years
    ORDER BY
        years ASC;
    `;

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch dashboard issue volume trends data',
      message: error.message
    });
  }
});

app.post('/dashboard_issuer_table_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        issuer_details.id,
        issuer_name AS name,
        COUNT(isin) AS noIssuer,
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM issuer_details 
      INNER JOIN isin_re_issuance
        ON isin_re_issuance.issuer_master_id = issuer_details.id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY issuer_details.id
      ORDER BY SUM(issue_size) DESC
      LIMIT 10;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard table data', message: error.message });
  }
});
app.post('/dashboard_arranger_table_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        master_arranger.id,
        master_arranger.short_name AS name,
        COUNT(isin) AS noIssuer,
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM master_arranger
      INNER JOIN issuer_arranger 
        ON master_arranger.id = issuer_arranger.arranger_id
      INNER JOIN isin_re_issuance 
        ON issuer_arranger.issuer_id = isin_re_issuance.isin_id
      INNER JOIN issuer_details 
        ON isin_re_issuance.issuer_master_id = issuer_details.id
      WHERE
        allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY
        master_arranger.id, master_arranger.short_name
      ORDER BY
        SUM(issue_size) DESC
      LIMIT 10;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard arranger table data', message: error.message });
  }
});
app.post('/dashboard_trustee_table_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        master_trustee.id,
        master_trustee.short_name AS name,
        COUNT(isin) AS noIssuer,
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM master_trustee
      INNER JOIN issuer_trustee 
        ON master_trustee.id = issuer_trustee.trustee_id
      INNER JOIN isin_re_issuance 
        ON issuer_trustee.issuer_id = isin_re_issuance.isin_id
      INNER JOIN issuer_details 
        ON isin_re_issuance.issuer_master_id = issuer_details.id
      WHERE
        allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY
        master_trustee.id, master_trustee.short_name
      ORDER BY
        SUM(issue_size) DESC
      LIMIT 10;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard trustee table data', message: error.message });
  }
});
app.post('/dashboard_registrar_table_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        master_registrar.id,
        master_registrar.short_name AS name,
        COUNT(isin) AS noIssuer,
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM master_registrar
      INNER JOIN issuer_registrar 
        ON master_registrar.id = issuer_registrar.registrar_id
      INNER JOIN isin_re_issuance 
        ON issuer_registrar.issuer_id = isin_re_issuance.isin_id
      INNER JOIN issuer_details 
        ON isin_re_issuance.issuer_master_id = issuer_details.id
      WHERE
        allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY
        master_registrar.id, master_registrar.short_name
      ORDER BY
        SUM(issue_size) DESC
      LIMIT 10;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard trustee table data', message: error.message });
  }
});
app.post('/dashboard_agency_table_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT
        master_agency.id,
        master_agency.short_name AS name,
        COUNT(isin) AS noIssuer,
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM master_agency
      INNER JOIN master_issuer_rating 
        ON master_agency.id = master_issuer_rating.agency_id
      INNER JOIN isin_re_issuance 
        ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      INNER JOIN issuer_details 
        ON isin_re_issuance.issuer_master_id = issuer_details.id
      WHERE
        allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY
        master_agency.id, master_agency.short_name
      ORDER BY
        SUM(issue_size) DESC
      LIMIT 10;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard trustee table data', message: error.message });
  }
});

app.post('/dashboard_sectors_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    // Basic validation
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // 1. Define all five SQL queries without backticks
    const issuersQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const arrangersQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      INNER JOIN issuer_arranger on issuer_arranger.issuer_id = isin_re_issuance.isin_id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const trusteeQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      INNER JOIN issuer_trustee on issuer_trustee.issuer_id = isin_re_issuance.isin_id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const registrarQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      INNER JOIN issuer_registrar on issuer_registrar.issuer_id = isin_re_issuance.isin_id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const ratingAgenciesQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      INNER JOIN master_issuer_rating on master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    // 2. Create an array of promises from the Prisma queries
    const queries = [
      prisma.$queryRawUnsafe(issuersQuery),
      prisma.$queryRawUnsafe(arrangersQuery),
      prisma.$queryRawUnsafe(trusteeQuery),
      prisma.$queryRawUnsafe(registrarQuery),
      prisma.$queryRawUnsafe(ratingAgenciesQuery),
    ];

    // 3. Use Promise.all to execute all queries concurrently
    const [
      issuers,
      arrangers,
      trustees,
      registrars,
      ratingAgencies
    ] = await Promise.all(queries);

    // 4. Construct the final response object
    const result = {
      issuers,
      arrangers,
      trustees,
      registrars,
      ratingAgencies
    };

    // 5. Send the successful response
    res.status(200).json(result);

  } catch (error) {
    console.error('Error fetching dashboard sector data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard sector data', message: error.message });
  }
});

app.post('/dashboard_agency_rating_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Dynamic count for percentage calculation
    const totalRatingsResult = await prisma.$queryRawUnsafe(`SELECT count(*) as aggregate FROM master_issuer_rating`);
    const totalRatings = Number(totalRatingsResult[0]?.aggregate) || 1;

    // Helper function to build the query to reduce code repetition
    const buildQuery = (joinClause = '') => `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.id) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        GROUP_CONCAT(DISTINCT master_issuer_rating.rating SEPARATOR ', ') as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN isin_re_issuance as i ON i.isin_id = master_issuer_rating.issuer_id
      ${joinClause}
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
      GROUP BY master_agency.short_name
    `;

    // Execute queries concurrently
    const [issuers, arrangers, trustees, registrars, ratingAgencies] = await Promise.all([
      prisma.$queryRawUnsafe(buildQuery()), // Base query
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_arranger ON issuer_arranger.issuer_id = i.isin_id')),
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_trustee ON issuer_trustee.issuer_id = i.isin_id')),
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_registrar ON issuer_registrar.issuer_id = i.isin_id')),
      prisma.$queryRawUnsafe(buildQuery())  // Duplicate of base query as requested
    ]);

    res.status(200).json({ issuers, arrangers, trustees, registrars, ratingAgencies });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data', message: error.message });
  }
});


app.post('/dashboard_monthly_comparison_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    // Basic validation
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Step 1: Calculate the previous year's date range
    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    // Helper to format date back to 'YYYY-MM-DD HH:MM:SS'
    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    // Step 2: Define the two SQL queries using dynamic dates
    const currentYearQuery = `
      SELECT
        MONTH(isin_re_issuance.allotment_date) as allotment_month,
        a.month_name as month_name,
        ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
        COUNT(isin_re_issuance.isin) AS issue_count
      FROM isin_re_issuance
      JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
      WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (isin_re_issuance.is_visible = 1)
      GROUP BY allotment_month, a.month_name
      ORDER BY allotment_month ASC
    `;

    const previousYearQuery = `
      SELECT
        MONTH(isin_re_issuance.allotment_date) as allotment_month,
        a.month_name as month_name,
        ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
        COUNT(isin_re_issuance.isin) AS issue_count
      FROM isin_re_issuance
      JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
      WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (isin_re_issuance.is_visible = 1)
      GROUP BY allotment_month, a.month_name
      ORDER BY allotment_month ASC
    `;

    // Step 3: Execute both queries concurrently using Promise.all
    const [currentYearData, previousYearData] = await Promise.all([
      prisma.$queryRawUnsafe(currentYearQuery),
      prisma.$queryRawUnsafe(previousYearQuery),
    ]);

    // Step 4: Merge the two result sets into the desired format
    // Create a Map for efficient lookup of previous year's data by month number
    const previousYearMap = new Map(
      previousYearData.map(row => [row.allotment_month, row])
    );

    const mergedResult = currentYearData.map(currentRow => {
      const previousRow = previousYearMap.get(currentRow.allotment_month);

      return {
        month_name: currentRow.month_name,
        current_year_issue_size: currentRow.total_issue_size || 0,
        previous_year_issue_size: previousRow ? previousRow.total_issue_size : 0,
        current_year_issue_count: currentRow.issue_count || 0,
        previous_year_issue_count: previousRow ? previousRow.issue_count : 0,
      };
    });

    // Step 5: Send the successful response
    res.status(200).json(mergedResult);

  } catch (error) {
    console.error('Error fetching monthly comparison data:', error);
    res.status(500).json({ error: 'Failed to fetch monthly comparison data', message: error.message });
  }
});

app.post('/dashboard_top_stats_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const result = await prisma.$queryRawUnsafe(`
      SELECT
        (
          SELECT COALESCE(ROUND(MAX(mi.issue_size) / 10000000), 0)
          FROM isin_re_issuance mi
          WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
            AND mi.is_visible = 1
        ) AS largest_issue_size,

        (
          SELECT id.issuer_name
          FROM isin_re_issuance mi
          INNER JOIN issuer_details id
            ON id.id = mi.issuer_master_id
          WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
            AND mi.is_visible = 1
          ORDER BY mi.issue_size DESC
          LIMIT 1
        ) AS largest_issue_issuer_name,

        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS total_issue_size_in_cr,

        COALESCE(ROUND(AVG(issue_size) / 10000000), 0) AS avg_issue_size_in_cr,

        COUNT(*) AS total_issues,

        (
          SELECT b.description
          FROM isin_re_issuance mi
          INNER JOIN master_business_sector b
            ON b.code = mi.business_sector
          WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
            AND mi.is_visible = 1
            AND mi.business_sector IS NOT NULL
          GROUP BY mi.business_sector, b.description
          ORDER BY SUM(mi.issue_size) DESC
          LIMIT 1
        ) AS top_sector_by_volume

      FROM isin_re_issuance
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND is_visible = 1;
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch dashboard stats data',
      message: error.message
    });
  }
});

app.post('/dashboard_specific_entity_data', async (req, res) => {
  try {
    const { id, startDate, endDate, tab } = req.body;

    if (!startDate || !endDate || !id) {
      return res.status(400).json({ error: 'startDate, endDate, and id are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    // Generate a list of all months in the date range
    const getAllMonthsInRange = (startDate, endDate) => {
      const months = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const monthNumber = currentDate.getMonth() + 1; // getMonth() is 0-indexed
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[monthNumber - 1];

        months.push({
          allotment_month: monthNumber,
          month_name: monthName
        });

        // Move to the next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return months;
    };

    const allMonths = getAllMonthsInRange(currentStartDate, currentEndDate);

    // Step 1: Fetch the dynamic total count of ratings first
    const totalRatingsQuery = `SELECT count(*) as aggregate FROM master_issuer_rating`;
    const totalRatingsResult = await prisma.$queryRawUnsafe(totalRatingsQuery);
    // Use the dynamic count, with a fallback of 1 to prevent division by zero
    const totalRatings = totalRatingsResult[0]?.aggregate || 1;

    let currentYearQuery = '';
    let previousYearQuery = '';
    let sectorsQuery = '';
    let ratingQuery = '';

    switch (tab) {
      case 'issuers':
        currentYearQuery = `
  SELECT
    MONTH(isin_re_issuance.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(isin_re_issuance.isin) AS issue_count
  FROM isin_re_issuance
  JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
  WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (isin_re_issuance.is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(isin_re_issuance.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(isin_re_issuance.isin) AS issue_count
  FROM isin_re_issuance
  JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
  WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (isin_re_issuance.is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        sectorsQuery = `
              SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      and issuer_master_id = ${id}
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;

        `;
        ratingQuery = `
              select 
        master_issuer_rating.rating, 
        w.description as watch, 
        master_issuer_rating.outlook, 
        master_issuer_rating.rating_date, 
        i.isin, 
        master_agency.short_name as agency_name 
      from master_issuer_rating 
      left join master_agency on master_agency.id = master_issuer_rating.agency_id 
      left join master_credit_rating_watch as w on w.code = master_issuer_rating.watch 
      left join isin_re_issuance as i on i.isin_id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
      and FIND_IN_SET(i.isin_id,master_issuer_rating.issuer_id) 
      order by master_issuer_rating.rating_date 
      asc
        `;
        break;
      case 'arrangers':
        currentYearQuery = `
        SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_arranger AS ia 
    ON ia.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (mi.is_visible = 1)
  AND ia.arranger_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

        `;
        previousYearQuery = `
                SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_arranger AS ia 
    ON ia.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (mi.is_visible = 1)
  AND ia.arranger_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC;
        `;
        sectorsQuery = `
        SELECT 
    b.description AS business_name,
    COALESCE(ROUND(SUM(mi.issue_size) / 10000000), 0) AS issue_size,
    COUNT(mi.isin) AS no_of_issue,
    CONCAT(
        "#",
        SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)
    ) AS color
FROM isin_re_issuance AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_arranger AS ia
    ON ia.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (mi.is_visible = 1)
  AND mi.business_sector IS NOT NULL
  AND ia.arranger_id = ${id}
GROUP BY mi.business_sector
ORDER BY issue_size DESC
LIMIT 10;

        `;
        ratingQuery = `
        SELECT 
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatings}) * 100,
        2
    ) AS percentage,
    COUNT(master_issuer_rating.id) AS rating_no,
    CONCAT(
        '#',
        SUBSTRING(
            (LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)),
            -6
        )
    ) AS color,
    master_issuer_rating.rating as name
FROM master_agency
INNER JOIN master_issuer_rating 
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN isin_re_issuance AS i 
    ON i.isin_id = master_issuer_rating.issuer_id
INNER JOIN issuer_arranger 
    ON issuer_arranger.issuer_id = i.isin_id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
    AND issuer_arranger.arranger_id = ${id}
GROUP BY 
    master_issuer_rating.agency_id;

        `;
        break;

      case 'trustees':

        currentYearQuery = `
        SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_trustee AS it
    ON it.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (mi.is_visible = 1)
  AND it.trustee_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

        `;
        previousYearQuery = `
        SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_trustee AS it
    ON it.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (mi.is_visible = 1)
  AND it.trustee_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

        `;
        sectorsQuery = `
        SELECT 
    b.description AS business_name,
    COALESCE(ROUND(SUM(mi.issue_size) / 10000000), 0) AS issue_size,
    COUNT(mi.isin) AS no_of_issue,
    CONCAT(
        "#",
        SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)
    ) AS color
FROM isin_re_issuance AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_trustee AS it
    ON it.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (mi.is_visible = 1)
  AND mi.business_sector IS NOT NULL
  AND it.trustee_id = ${id}
GROUP BY mi.business_sector, b.description
ORDER BY issue_size DESC
LIMIT 10;

        `;
        ratingQuery = `
        SELECT 
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatings}) * 100,
        2
    ) AS percentage,
    COUNT(master_issuer_rating.id) AS rating_no,
    CONCAT(
        '#',
        SUBSTRING(
            (LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)),
            -6
        )
    ) AS color,
    master_issuer_rating.rating as name
FROM master_agency
INNER JOIN master_issuer_rating 
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN isin_re_issuance AS i 
    ON i.isin_id = master_issuer_rating.issuer_id
INNER JOIN issuer_trustee 
    ON issuer_trustee.issuer_id = i.isin_id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
    AND issuer_trustee.trustee_id = ${id}
GROUP BY 
    master_issuer_rating.agency_id;

        `;
        break;
      case 'registrars':

        currentYearQuery = `
SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_registrar AS ir 
    ON ir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (mi.is_visible = 1)
  AND ir.registrar_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

`;
        previousYearQuery = `
SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_registrar AS ir 
    ON ir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (mi.is_visible = 1)
  AND ir.registrar_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

`;
        sectorsQuery = `
        SELECT 
    b.description AS business_name,
    COALESCE(ROUND(SUM(mi.issue_size) / 10000000), 0) AS issue_size,
    COUNT(mi.isin) AS no_of_issue,
    CONCAT(
        "#",
        SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)
    ) AS color
FROM isin_re_issuance AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_registrar AS ir
    ON ir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (mi.is_visible = 1)
  AND mi.business_sector IS NOT NULL
  AND ir.registrar_id = ${id}
GROUP BY mi.business_sector, b.description
ORDER BY issue_size DESC
LIMIT 10;

        `;
        ratingQuery = `
        SELECT 
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatings}) * 100,
        2
    ) AS percentage,
    COUNT(master_issuer_rating.id) AS rating_no,
    CONCAT(
        '#',
        SUBSTRING(
            (LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)),
            -6
        )
    ) AS color,
    master_issuer_rating.rating as name
FROM master_agency
INNER JOIN master_issuer_rating 
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN isin_re_issuance AS i 
    ON i.isin_id = master_issuer_rating.issuer_id
INNER JOIN issuer_registrar 
    ON issuer_registrar.issuer_id = i.isin_id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
    AND issuer_registrar.registrar_id = ${id}
GROUP BY 
    master_issuer_rating.agency_id;

        `;

        break;
      case 'agency':

        currentYearQuery = `
      SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (mi.is_visible = 1)
  AND mir.agency_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

      `;
        previousYearQuery = `
      SELECT 
    MONTH(mi.allotment_date) AS allotment_month,
    a.month_name AS month_name,
    ROUND(SUM(mi.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(mi.isin) AS issue_count
FROM isin_re_issuance AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (mi.is_visible = 1)
  AND mir.agency_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY allotment_month ASC;

      `;

        sectorsQuery = `
        SELECT 
    b.description AS business_name,
    COALESCE(ROUND(SUM(mi.issue_size) / 10000000), 0) AS issue_size,
    COUNT(mi.isin) AS no_of_issue,
    CONCAT(
        "#",
        SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)
    ) AS color
FROM isin_re_issuance AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.isin_id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (mi.is_visible = 1)
  AND mi.business_sector IS NOT NULL
  AND mir.agency_id = ${id}
GROUP BY mi.business_sector, b.description
ORDER BY issue_size DESC
LIMIT 10;

        `;
        ratingQuery = `
        SELECT 
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatings}) * 100,
        2
    ) AS percentage,
    COUNT(master_issuer_rating.id) AS rating_no,
    CONCAT(
        '#',
        SUBSTRING(
            (LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)),
            -6
        )
    ) AS color,
    master_issuer_rating.rating as name
FROM master_agency
INNER JOIN master_issuer_rating 
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN isin_re_issuance AS i
    ON i.isin_id = master_issuer_rating.issuer_id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
    AND master_issuer_rating.agency_id = ${id}
GROUP BY 
    master_issuer_rating.rating;

        `;
        // Valid tab, proceed
        break;
      default:
        currentYearQuery = `
  SELECT
    MONTH(isin_re_issuance.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(isin_re_issuance.isin) AS issue_count
  FROM isin_re_issuance
  JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
  WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (isin_re_issuance.is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(isin_re_issuance.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(isin_re_issuance.isin) AS issue_count
  FROM isin_re_issuance
  JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
  WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (isin_re_issuance.is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        sectorsQuery = `
              SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM isin_re_issuance
      INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      and issuer_master_id = ${id}
      GROUP BY isin_re_issuance.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;

        `;
        ratingQuery = `
              select 
        master_issuer_rating.rating, 
        w.description as watch, 
        master_issuer_rating.outlook, 
        master_issuer_rating.rating_date, 
        i.isin, 
        master_agency.short_name as agency_name 
      from master_issuer_rating 
      left join master_agency on master_agency.id = master_issuer_rating.agency_id 
      left join master_credit_rating_watch as w on w.code = master_issuer_rating.watch 
      left join isin_re_issuance as i on i.isin_id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between '${startDate}' AND '${endDate}' AND (i.is_visible = 1)
      and FIND_IN_SET(i.isin_id,master_issuer_rating.issuer_id) 
      order by master_issuer_rating.rating_date 
      asc
        `;
    }

    //monthly comparison query
    //     const currentYearQuery = `
    //   SELECT
    //     MONTH(isin_re_issuance.allotment_date) as allotment_month,
    //     a.month_name as month_name,
    //     ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    //     COUNT(isin_re_issuance.isin) AS issue_count
    //   FROM isin_re_issuance
    //   JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
    //   WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
    //   AND issuer_master_id = ${id}
    //   GROUP BY allotment_month, a.month_name
    //   ORDER BY a.id ASC
    // `;

    //     const previousYearQuery = `
    //   SELECT
    //     MONTH(isin_re_issuance.allotment_date) as allotment_month,
    //     a.month_name as month_name,
    //     ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS total_issue_size,
    //     COUNT(isin_re_issuance.isin) AS issue_count
    //   FROM isin_re_issuance
    //   JOIN all_months as a ON a.month_no = MONTH(isin_re_issuance.allotment_date)
    //   WHERE isin_re_issuance.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
    //   AND issuer_master_id = ${id}
    //   GROUP BY allotment_month, a.month_name
    //   ORDER BY a.id ASC
    // `;

    const [currentYearData, previousYearData] = await Promise.all([
      prisma.$queryRawUnsafe(currentYearQuery),
      prisma.$queryRawUnsafe(previousYearQuery),
    ]);

    // Create maps for faster lookup
    const currentYearMap = new Map(
      currentYearData.map(row => [row.allotment_month, row])
    );

    const previousYearMap = new Map(
      previousYearData.map(row => [row.allotment_month, row])
    );

    // Generate the result with all months in the range
    const monthlyVolumeResult = allMonths.map(month => {
      const currentRow = currentYearMap.get(month.allotment_month);
      const previousRow = previousYearMap.get(month.allotment_month);

      return {
        month_name: month.month_name,
        current_year_issue_size: currentRow ? currentRow.total_issue_size : 0,
        previous_year_issue_size: previousRow ? previousRow.total_issue_size : 0,
        current_year_issue_count: currentRow ? currentRow.issue_count : 0,
        previous_year_issue_count: previousRow ? previousRow.issue_count : 0,
      };
    });

    //sectors data
    // const issuersQuery = `
    //   SELECT
    //     b.description as business_name,
    //     COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
    //     COUNT(isin) AS no_of_issue,
    //     concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
    //   FROM isin_re_issuance
    //   INNER JOIN master_business_sector as b on b.code = isin_re_issuance.business_sector
    //   WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
    //   and issuer_master_id = ${id}
    //   GROUP BY isin_re_issuance.business_sector
    //   ORDER BY issue_size DESC
    //   LIMIT 10;
    // `;

    const resultSectors = await prisma.$queryRawUnsafe(sectorsQuery);

    const agencyQuery = `
      select 
        master_issuer_rating.rating, 
        w.description as watch, 
        master_issuer_rating.outlook, 
        master_issuer_rating.rating_date, 
        i.isin, 
        master_agency.short_name as agency_name 
      from master_issuer_rating 
      left join master_agency on master_agency.id = master_issuer_rating.agency_id 
      left join master_credit_rating_watch as w on w.code = master_issuer_rating.watch 
      left join isin_re_issuance as i on i.isin_id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between "2025-04-01 00:00:00" and "2025-11-07 23:59:59"  
      and FIND_IN_SET(i.isin_id,master_issuer_rating.issuer_id) 
      order by master_issuer_rating.rating_date 
      asc
    `;

    const resultAgency = await prisma.$queryRawUnsafe(ratingQuery);


    res.status(200).json({ monthlyVolumeResult, resultSectors, resultAgency });

  } catch (error) {
    console.error('Error fetching dashboard specific entity data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard specific entity data', message: error.message });
  }
});




app.post('/testing', async (req, res) => {
  const { startDate, endDate } = req.body;

  console.log('db url:', process.env.DATABASE_URL);
  const result = ['success'];

  res.status(200).json(result);
});

//updated Analysis page APIs DONE

app.post('/analysisPage_entity_ranking_data', async (req, res) => {
  try {
    const { startDate, endDate, entity, limit = 10 } = req.body;

    if (!startDate || !endDate || !entity) {
      return res.status(400).json({
        error: 'startDate, endDate and entity are required'
      });
    }

    // Calculate Previous Year Date Range
    const pyStartDate = new Date(startDate);
    pyStartDate.setFullYear(pyStartDate.getFullYear() - 1);

    const pyEndDate = new Date(endDate);
    pyEndDate.setFullYear(pyEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    // Dynamic config based on entity
    let config = {};

    switch (entity) {
      case 'issuers':
        config = {
          idField: 'issuer_details.id',
          nameField: 'issuer_details.issuer_name',
          joins: `
            join issuer_details 
              on issuer_details.id = isin_re_issuance.issuer_master_id
          `,
          groupBy: 'issuer_details.id'
        };
        break;

      case 'arrangers':
        config = {
          idField: 'master_arranger.id',
          nameField: 'master_arranger.short_name',
          joins: `
            join issuer_details 
              on issuer_details.id = isin_re_issuance.issuer_master_id
            join issuer_arranger 
              on issuer_arranger.issuer_id = isin_re_issuance.isin_id
            join master_arranger 
              on master_arranger.id = issuer_arranger.arranger_id
          `,
          groupBy: 'issuer_arranger.arranger_id'
        };
        break;

      case 'trustees':
        config = {
          idField: 'master_trustee.id',
          nameField: 'master_trustee.short_name',
          joins: `
            join issuer_details 
              on issuer_details.id = isin_re_issuance.issuer_master_id
            join issuer_trustee 
              on issuer_trustee.issuer_id = isin_re_issuance.isin_id
            join master_trustee 
              on master_trustee.id = issuer_trustee.trustee_id
          `,
          groupBy: 'issuer_trustee.trustee_id'
        };
        break;

      case 'registrars':
        config = {
          idField: 'master_registrar.id',
          nameField: 'master_registrar.short_name',
          joins: `
            join issuer_details 
              on issuer_details.id = isin_re_issuance.issuer_master_id
            join issuer_registrar 
              on issuer_registrar.issuer_id = isin_re_issuance.isin_id
            join master_registrar 
              on master_registrar.id = issuer_registrar.registrar_id
          `,
          groupBy: 'issuer_registrar.registrar_id'
        };
        break;

      default:
        return res.status(400).json({
          error: 'Invalid entity type'
        });
    }

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from isin_re_issuance where allotment_date between '${startDate}' AND '${endDate}' AND (is_visible = 1)
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from isin_re_issuance where allotment_date between '${formatDate(pyStartDate)}' AND '${formatDate(pyEndDate)}' AND (is_visible = 1)
      `)



    const query = `
      SELECT
        table1.id,
        table1.issuer_name,
        table1.no_issues AS cy_issues,
        table1.issue_size AS cy_issue_size,
        table1.arr_rank AS cy_arr_rank,
        table2.no_issues AS py_issues,
        table2.issue_size AS py_issue_size,
        table2.arr_rank AS py_arr_rank,
        ROUND((table1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100, 2) AS py_mkt_share,
        (
          CASE
            WHEN (IFNULL(table1.issue_size,0) + IFNULL(table2.issue_size,0)) = 0 THEN 0
            ELSE ROUND(
              ((IFNULL(table1.issue_size,0) - IFNULL(table2.issue_size,0)) /
              (IFNULL(table1.issue_size,0) + IFNULL(table2.issue_size,0))) * 100
            ,2)
          END
        ) AS yoy
      FROM
      (
        SELECT
          ${config.idField} AS id,
          ${config.nameField} AS issuer_name,
          COUNT(isin) AS no_issues,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY ROUND(SUM(issue_size) / 10000000, 2) DESC,
            COUNT(isin) DESC
          ) AS arr_rank
        FROM isin_re_issuance
        ${config.joins}
        WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
        GROUP BY ${config.groupBy}
        ORDER BY arr_rank
        LIMIT 0, ${limit}
      ) AS table1
      LEFT JOIN
      (
        SELECT
          ${config.idField} AS id,
          ${config.nameField} AS issuer_name,
          COUNT(isin) AS no_issues,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY ROUND(SUM(issue_size) / 10000000, 2) DESC,
            COUNT(isin) DESC
          ) AS arr_rank
        FROM isin_re_issuance
        ${config.joins}
        WHERE allotment_date BETWEEN '${formatDate(pyStartDate)}' AND '${formatDate(pyEndDate)}' AND (is_visible = 1)
        GROUP BY ${config.groupBy}
      ) AS table2
      ON table1.id = table2.id
      ORDER BY yoy DESC, cy_issue_size DESC
    `;

    const result = await prisma.$queryRawUnsafe(query);

    res.json({
      success: true,
      entity,
      data: result
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});


const hasFilterValue = (value) => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined &&
    value !== null &&
    value !== '';
};
//updated issuer APIs DONE
//updated issuer APIs DONE
app.post('/issuers_page_top_issuers_data', async (req, res) => {
  try {
    const {
      startDate = '2025-01-01',
      endDate = '2026-01-01',
      issueType = '',
      issuerName = '',
      rating = '',
      seniority = '',
      taxFree = '',
      securedFlag = '',
      sector = '',
      trustee = '',
      nature = '',
      ownershipType = '',
      creditRatingAgency = '',
      dealSize = '',
      listingStatus = '',
      securityType = '',
      modeOfIssue = ''
    } = req.body;

    // ─── Validate required dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);
    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);

    // ─── Helper: Build multi-value IN clause ───
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values) ? values.filter(v => v !== '' && v !== null && v !== undefined) : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // ─── Build dynamic joins and conditions based ONLY on provided filters ───
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();
      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      if (hasFilterValue(issuerName)) {
        addJoin('LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id');
        const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(rating)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        const inClause = buildInClause('master_issuer_rating.rating', rating);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(listingStatus)) {
        addJoin(`LEFT JOIN (
          SELECT mise.issuer_id, MAX(mls.description) AS listing_status
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id
        ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id`);
        const inClause = buildInClause('listing_data.listing_status', listingStatus);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(seniority)) {
        addJoin('LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority');
        const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(taxFree)) {
        addJoin('LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free');
        const inClause = buildInClause('master_tax_free.description', taxFree);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(securedFlag)) {
        addJoin('LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag');
        const inClause = buildInClause('master_secured_flag.description', securedFlag);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(sector)) {
        addJoin('LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector');
        const inClause = buildInClause('master_business_sector.description', sector);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(trustee)) {
        addJoin('LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id');
        const inClause = buildInClause('master_trustee.short_name', trustee);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(nature)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type');
        const inClause = buildInClause('master_issuer_type_nature.description', nature);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(ownershipType)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type');
        const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(creditRatingAgency)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id');
        const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(securityType)) {
        addJoin('LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class');
        const inClause = buildInClause('master_security_type.description', securityType);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(modeOfIssue)) {
        addJoin('LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue');
        const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return { joins, conditions, params };
    };

    const { joins: filterJoins, conditions: filterConditions, params: filterParams } = buildFilterParts();

    const filterClause = filterConditions.length > 0 ? `AND ${filterConditions.join(' AND ')}` : '';
    const totalJoins = filterJoins.join('\n');

    // For the table query, we always need issuer_details to group by issuer
    const tableJoinsSet = new Set(filterJoins);
    const issuerDetailsJoin = 'LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id';
    if (!tableJoinsSet.has(issuerDetailsJoin)) {
      tableJoinsSet.add(issuerDetailsJoin);
    }
    const tableJoins = Array.from(tableJoinsSet).join('\n');

    console.log("cyStart:", cyStart);
    console.log("cyEnd:", cyEnd);
    console.log("filterJoins:", filterJoins);
    console.log("filterConditions:", filterConditions);
    console.log("filterParams:", filterParams);

    // ─── Date range condition ───
    const dateConditions = `isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1)`;

    // ─── Total aggregate queries ───
    const totalIssueSizeQuery = `
      SELECT 
        SUM(isin_re_issuance.issue_size) AS aggregate
      FROM isin_re_issuance
      ${totalJoins}
      WHERE ${dateConditions}
      ${filterClause}
    `;

    const totalIssuesCountQuery = `
      SELECT 
        COUNT(DISTINCT isin_re_issuance.id) AS aggregate
      FROM isin_re_issuance
      ${totalJoins}
      WHERE ${dateConditions}
      ${filterClause}
    `;

    const cyParams = [cyStart, cyEnd, ...filterParams];
    const pyParams = [pyStart, pyEnd, ...filterParams];

    const [totalIssueSize, totalIssueSizePrevYear, totalIssuesCountCurrYear, totalIssuesCountPrevYear] = await Promise.all([
      prisma.$queryRawUnsafe(totalIssueSizeQuery, ...cyParams),
      prisma.$queryRawUnsafe(totalIssueSizeQuery, ...pyParams),
      prisma.$queryRawUnsafe(totalIssuesCountQuery, ...cyParams),
      prisma.$queryRawUnsafe(totalIssuesCountQuery, ...pyParams)
    ]);

    const totalIssueSizeCY = Number(totalIssueSize[0]?.aggregate) || 0;
    const totalIssueSizePY = Number(totalIssueSizePrevYear[0]?.aggregate) || 0;
    const totalIssuesCountCY = Number(totalIssuesCountCurrYear[0]?.aggregate) || 0;
    const totalIssuesCountPY = Number(totalIssuesCountPrevYear[0]?.aggregate) || 0;

    const cySizeDivisor = totalIssueSizeCY / 10000000;
    const pySizeDivisor = totalIssueSizePY / 10000000;
    const cyCountDivisor = totalIssuesCountCY;
    const pyCountDivisor = totalIssuesCountPY;

    const rankByCount = issueType === 'count';

    const rankOrder = rankByCount
      ? `COUNT(mi.isin) DESC, ROUND(SUM(mi.issue_size) / 10000000, 2) DESC`
      : `ROUND(SUM(mi.issue_size) / 10000000, 2) DESC, COUNT(mi.isin) DESC`;

    const shareColumn = rankByCount ? 'no_issues' : 'issue_size';
    const cyDivisor = rankByCount ? cyCountDivisor : cySizeDivisor;
    const pyDivisor = rankByCount ? pyCountDivisor : pySizeDivisor;

    // ─── Table query: uses only the joins required by filters + issuer_details for grouping ───
    const tableQuery = `
      WITH 
      cy_data AS (
        SELECT
          mi.issuer_id AS id,
          mi.issuer_name AS issuer_name,
          COUNT(DISTINCT mi.id) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT 
            isin_re_issuance.id, 
            isin_re_issuance.issuer_master_id, 
            isin_re_issuance.isin, 
            isin_re_issuance.issue_size,
            issuer_details.id as issuer_id,
            issuer_details.issuer_name
          FROM isin_re_issuance
          ${tableJoins}
          WHERE ${dateConditions} ${filterClause}
        ) AS mi
        GROUP BY mi.issuer_id, mi.issuer_name
        ORDER BY arr_rank
        LIMIT 10
      ),
      py_data AS (
        SELECT
          mi.issuer_id AS id,
          mi.issuer_name AS issuer_name,
          COUNT(DISTINCT mi.id) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT 
            isin_re_issuance.id, 
            isin_re_issuance.issuer_master_id, 
            isin_re_issuance.isin, 
            isin_re_issuance.issue_size,
            issuer_details.id as issuer_id,
            issuer_details.issuer_name
          FROM isin_re_issuance
          ${tableJoins}
          WHERE ${dateConditions} ${filterClause}
        ) AS mi
        GROUP BY mi.issuer_id, mi.issuer_name
      )
      SELECT
        cy.id AS id,
        cy.issuer_name AS issuer_name,
        cy.no_issues AS cy_issues,
        cy.issue_size AS cy_issue_size,
        cy.arr_rank AS cy_arr_rank,
        py.no_issues AS py_issues,
        py.issue_size AS py_issue_size,
        py.arr_rank AS py_arr_rank,
        CASE 
          WHEN ? = 0 OR ? IS NULL THEN 0 
          ELSE ROUND((cy.${shareColumn} / ?) * 100, 2) 
        END as cy_mkt_share,
        CASE 
          WHEN ? = 0 OR ? IS NULL THEN 0 
          ELSE ROUND((py.${shareColumn} / ?) * 100, 2) 
        END as py_mkt_share,
        CASE
          WHEN (IFNULL(cy.${shareColumn}, 0) + IFNULL(py.${shareColumn}, 0)) = 0 THEN 0
          ELSE ROUND(((IFNULL(cy.${shareColumn}, 0) - IFNULL(py.${shareColumn}, 0)) / (IFNULL(cy.${shareColumn}, 0) + IFNULL(py.${shareColumn}, 0))) * 100, 2)
        END as yoy
      FROM cy_data cy
      LEFT JOIN py_data py ON cy.id = py.id
      ORDER BY cy.arr_rank ASC
    `;

    const tableParams = [
      ...cyParams,
      ...pyParams,
      cyDivisor, cyDivisor, cyDivisor,
      pyDivisor, pyDivisor, pyDivisor
    ];

    const result = await prisma.$queryRawUnsafe(tableQuery, ...tableParams);

    const finalResult = result.map((item) => {
      return {
        id: item?.id ?? '-',
        rank: item?.cy_arr_rank ?? '-',
        name: item?.issuer_name ?? '-',
        currentSize: item?.cy_issue_size ?? '-',
        currentDeals: item?.cy_issues ?? '-',
        currentMarketShare: item?.cy_mkt_share ?? '-',
        previousRank: item?.py_arr_rank ?? '-',
        previousSize: item?.py_issue_size ?? '-',
        previousDeals: item?.py_issues ?? '-',
        previousMarketShare: item?.py_mkt_share ?? '-',
        yoyChange: item?.yoy ?? '-'
      };
    });

    const totals = {
      currentSize: (totalIssueSizeCY / 10000000) || 0,
      previousSize: (totalIssueSizePY / 10000000) || 0,
      currentDeals: totalIssuesCountCY,
      previousDeals: totalIssuesCountPY,
    };

    res.status(200).json({ data: finalResult, totals });
  } catch (error) {
    console.error('Error in issuers_page_top_issuers_data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.post('/issuers_page_top_sectors_data', async (req, res) => {
  try {
    const {
      startDate = '2025-01-01',
      endDate = '2026-01-01',
      issueType = '',
      issuerName = '',
      rating = '',
      seniority = '',
      taxFree = '',
      securedFlag = '',
      sector = '',
      trustee = '',
      nature = '',
      ownershipType = '',
      creditRatingAgency = '',
      dealSize = '',
      listingStatus = '',
      securityType = '',
      modeOfIssue = ''
    } = req.body;

    // ─── Validate required dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);
    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);

    // ─── Helper: Build multi-value IN clause ───
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values) ? values.filter(v => v !== '' && v !== null && v !== undefined) : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // ─── Build dynamic joins and conditions based ONLY on provided filters ───
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();
      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      if (hasFilterValue(issuerName)) {
        addJoin('LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id');
        const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(rating)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        const inClause = buildInClause('master_issuer_rating.rating', rating);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(listingStatus)) {
        addJoin(`LEFT JOIN (
          SELECT mise.issuer_id, MAX(mls.description) AS listing_status
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id
        ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id`);
        const inClause = buildInClause('listing_data.listing_status', listingStatus);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(seniority)) {
        addJoin('LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority');
        const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(taxFree)) {
        addJoin('LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free');
        const inClause = buildInClause('master_tax_free.description', taxFree);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(securedFlag)) {
        addJoin('LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag');
        const inClause = buildInClause('master_secured_flag.description', securedFlag);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(sector)) {
        addJoin('LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector');
        const inClause = buildInClause('master_business_sector.description', sector);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(trustee)) {
        addJoin('LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id');
        const inClause = buildInClause('master_trustee.short_name', trustee);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(nature)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type');
        const inClause = buildInClause('master_issuer_type_nature.description', nature);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(ownershipType)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type');
        const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(creditRatingAgency)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id');
        const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(securityType)) {
        addJoin('LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class');
        const inClause = buildInClause('master_security_type.description', securityType);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }
      if (hasFilterValue(modeOfIssue)) {
        addJoin('LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue');
        const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return { joins, conditions, params };
    };

    const { joins: filterJoins, conditions: filterConditions, params: filterParams } = buildFilterParts();

    const filterClause = filterConditions.length > 0 ? `AND ${filterConditions.join(' AND ')}` : '';
    const subqueryJoins = filterJoins.join('\n');

    const rankByCount = issueType === 'count';
    const orderColumn = rankByCount ? 'issue_no' : 'issue_size';
    const orderDirection = 'DESC';

    // ─── CTE-based query with dynamic joins for filters ───
    const sectorsQuery = `
      WITH 
      cy_data AS (
        SELECT
          isin_re_issuance.business_sector,
          MAX(mbs.description) AS sector_name,
          ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS issue_size,
          COUNT(DISTINCT isin_re_issuance.id) AS issue_no
        FROM isin_re_issuance
        ${subqueryJoins}
        JOIN master_business_sector mbs ON mbs.code = isin_re_issuance.business_sector
        WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
        GROUP BY isin_re_issuance.business_sector
        ORDER BY ${orderColumn} ${orderDirection}
        LIMIT 10
      ),
      py_data AS (
        SELECT
          isin_re_issuance.business_sector,
          MAX(mbs.description) AS sector_name,
          ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS issue_size,
          COUNT(DISTINCT isin_re_issuance.id) AS issue_no
        FROM isin_re_issuance
        ${subqueryJoins}
        JOIN master_business_sector mbs ON mbs.code = isin_re_issuance.business_sector
        WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
        GROUP BY isin_re_issuance.business_sector
      )
      SELECT
        cy.business_sector AS id,
        cy.sector_name AS sector_name,
        cy.issue_size AS cy_issue_size,
        cy.issue_no AS cy_issue_no,
        py.issue_size AS py_issue_size,
        py.issue_no AS py_issue_no
      FROM cy_data cy
      LEFT JOIN py_data py ON cy.business_sector = py.business_sector
      ORDER BY cy.${orderColumn} ${orderDirection}
    `;


    // Params: cy dates + filters for cy_data, then py dates + filters for py_data
    const cyParams = [cyStart, cyEnd, ...filterParams];
    const pyParams = [pyStart, pyEnd, ...filterParams];
    const queryParams = [...cyParams, ...pyParams];

    const result = await prisma.$queryRawUnsafe(sectorsQuery, ...queryParams);

    const finalResult = result.map((item) => {
      const cyValue = rankByCount ? item?.cy_issue_no : item?.cy_issue_size;
      const pyValue = rankByCount ? item?.py_issue_no : item?.py_issue_size;

      return {
        id: item?.id ?? '-',
        name: item?.sector_name ?? '-',
        value: cyValue !== null && cyValue !== undefined ? parseFloat(cyValue) : null,
        previousValue: pyValue !== null && pyValue !== undefined ? parseFloat(pyValue) : null,
      };
    });

    res.status(200).json(finalResult);
  } catch (error) {
    console.error('Error in issuers_page_top_sectors_data:', error);
    res.status(500).json({ error: 'Failed to fetch issuers top sectors data', message: error.message });
  }
});

app.post('/issuers_page_outstanding_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      issuerName = '',
      rating = '',
      seniority = '',
      taxFree = '',
      securedFlag = '',
      sector = '',
      trustee = '',
      nature = '',
      ownershipType = '',
      creditRatingAgency = '',
      dealSize = '',
      listingStatus = '',
      securityType = '',
      modeOfIssue = ''
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    // ─── Helper: Build multi-value IN clause ───
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // ─── Build dynamic joins & conditions based ONLY on provided filters ───
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();
      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      if (hasFilterValue(issuerName)) {
        addJoin('LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id');
        const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(rating)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        const inClause = buildInClause('master_issuer_rating.rating', rating);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(listingStatus)) {
        addJoin(`LEFT JOIN (
          SELECT mise.issuer_id, MAX(mls.description) AS listing_status
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id
        ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id`);
        const inClause = buildInClause('listing_data.listing_status', listingStatus);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(seniority)) {
        addJoin('LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority');
        const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(taxFree)) {
        addJoin('LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free');
        const inClause = buildInClause('master_tax_free.description', taxFree);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(securedFlag)) {
        addJoin('LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag');
        const inClause = buildInClause('master_secured_flag.description', securedFlag);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(sector)) {
        addJoin('LEFT JOIN master_business_sector AS mbs_filter ON mbs_filter.code = isin_re_issuance.business_sector');
        const inClause = buildInClause('mbs_filter.description', sector);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(trustee)) {
        addJoin('LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id');
        const inClause = buildInClause('master_trustee.short_name', trustee);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(nature)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type');
        const inClause = buildInClause('master_issuer_type_nature.description', nature);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(ownershipType)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type');
        const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(creditRatingAgency)) {
        addJoin('LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id');
        addJoin('LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id');
        const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(securityType)) {
        addJoin('LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class');
        const inClause = buildInClause('master_security_type.description', securityType);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(modeOfIssue)) {
        addJoin('LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue');
        const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }

      return { joins, conditions, params };
    };

    const { joins: filterJoins, conditions: filterConditions, params: filterParams } = buildFilterParts();

    const filterClause = filterConditions.length > 0 ? ` AND ${filterConditions.join(' AND ')}` : '';
    const issueJoins = filterJoins.join('\n');

    // ─── For outstanding query: master_issuer join is mandatory (used in WHERE security_status = 1) ───
    const outstandingJoinsSet = new Set(filterJoins);
    outstandingJoinsSet.add('LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id');
    const outstandingJoins = Array.from(outstandingJoinsSet).join('\n');

    // ─── Issue data (current year) — direct aggregation, no inner subquery ───
    const issueData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(isin_re_issuance.allotment_date) AS month,
        MONTHNAME(isin_re_issuance.allotment_date) AS label,
        ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT isin_re_issuance.isin) AS isin_count
      FROM isin_re_issuance
      ${issueJoins}
      WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
      GROUP BY month, label
      ORDER BY month ASC
    `, cyStart, cyEnd, ...filterParams);

    // ─── Redemption data (current year) — direct aggregation, no inner subquery ───
    const redemptionData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(isin_re_issuance.maturity_date) AS month,
        MONTHNAME(isin_re_issuance.maturity_date) AS label,
        ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT isin_re_issuance.isin) AS isin_count
      FROM isin_re_issuance
      ${issueJoins}
      WHERE isin_re_issuance.maturity_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
      GROUP BY month, label
      ORDER BY month ASC
    `, cyStart, cyEnd, ...filterParams);

    // ─── Generate month ranges using parsed dates ───
    function getMonthlyRanges(startDateObj, endDateObj) {
      let current = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), 1);
      const result = [];
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];

      while (current <= endDateObj) {
        const year = current.getFullYear();
        const month = current.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const effectiveEnd = monthEnd > endDateObj ? endDateObj : monthEnd;

        result.push({
          label: monthNames[month],
          start: formatDate(monthStart),
          end: formatDate(effectiveEnd),
        });

        current = new Date(year, month + 1, 1);
      }

      return result;
    }

    const allMonthRanges = getMonthlyRanges(currentStartDate, currentEndDate);

    // ─── Optimized outstanding queries — direct aggregation, no inner subquery ───
    const outstandingPromises = allMonthRanges.map(async ({ label, end }) => {
      const [result] = await prisma.$queryRawUnsafe(`
        SELECT ROUND(SUM(isin_re_issuance.issue_size) / 10000000, 2) AS aggregate
        FROM isin_re_issuance
        ${outstandingJoins}
        WHERE isin_re_issuance.allotment_date < ?
        AND isin_re_issuance.maturity_date > ?
        AND isin_re_issuance.is_visible = 1
        AND master_issuer.security_status = 1
        ${filterClause}
      `, end, end, ...filterParams);

      return {
        label,
        outstanding: result?.aggregate ?? 0
      };
    });

    const outstandingData = await Promise.all(outstandingPromises);

    // ─── Lookup maps for O(1) access ───
    const issueMap = new Map(issueData.map(item => [item.label, item]));
    const redemptionMap = new Map(redemptionData.map(item => [item.label, item]));
    const outstandingMap = new Map(outstandingData.map(item => [item.label, item]));

    const formattedData = allMonthRanges.map(({ label }) => {
      const issue = issueMap.get(label);
      const redemption = redemptionMap.get(label);
      const outstanding = outstandingMap.get(label);

      return {
        month: getShortMonthName(label) || label,
        issue: issue?.issue_size ?? 0,
        redemption: redemption?.issue_size ?? 0,
        outstanding: outstanding?.outstanding ?? 0
      };
    });

    res.status(200).json(formattedData);
  } catch (error) {
    console.error('Error in issuers_page_outstanding_data:', error);
    res.status(500).json({ error: 'Failed to fetch outstanding data', message: error.message });
  }
});

// ─── API 1: Current Year Debt Redemption Data ───
app.get('/issuers_page_current_year_debt_redemption_data', async (req, res) => {
  try {
    const now = new Date();
    const nextYear = getUpcomingMarch31(now);

    const startStr = formatDateForSQL(now);
    const endStr = formatDateForSQL(nextYear);

    // ─── FIX: Use parameterized query to prevent SQL injection ───
    const redemptionData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(maturity_date) AS month,
        MONTHNAME(maturity_date) AS label,
        YEAR(maturity_date) AS year,
        ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT isin) AS isin_count
      FROM isin_re_issuance
      WHERE maturity_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1)
      GROUP BY YEAR(maturity_date), MONTH(maturity_date), MONTHNAME(maturity_date)
      ORDER BY YEAR(maturity_date) ASC, MONTH(maturity_date) ASC
    `, startStr, endStr);

    res.status(200).json(redemptionData);
  } catch (error) {
    console.error('Error in issuers_page_current_year_debt_redemption_data:', error);
    res.status(500).json({ success: false, err: error.message });
  }
});

// ─── API 2: Next Year Redemption Data ───
app.get('/issuers_page_next_year_redemption_data', async (req, res) => {
  try {
    const { start, end } = getNextFinancialYearRange();

    // ─── FIX: Use parameterized query to prevent SQL injection ───
    const redemptionData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(maturity_date) AS month,
        MONTHNAME(maturity_date) AS label,
        YEAR(maturity_date) AS year,
        ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT isin) AS isin_count
      FROM isin_re_issuance
      WHERE maturity_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1)
      GROUP BY YEAR(maturity_date), MONTH(maturity_date), MONTHNAME(maturity_date)
      ORDER BY YEAR(maturity_date) ASC, MONTH(maturity_date) ASC
    `, start, end);

    // ─── FIX: Clean and format the result ───
    const formattedData = redemptionData.map((item) => ({
      month: item.month,
      monthShort: getShortMonthName(item.label),
      label: item.label,
      year: item.year,
      issueSize: Number(item.issue_size) || 0,
      isinCount: Number(item.isin_count) || 0
    }));

    res.status(200).json(redemptionData);
  } catch (error) {
    console.error('Error in issuers_page_next_year_redemption_data:', error);
    res.status(500).json({ success: false, err: error.message });
  }
});

app.post('/issuers_page_agency_rating_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      id,
      issuerName = '',
      rating = '',
      seniority = '',
      taxFree = '',
      securedFlag = '',
      sector = '',
      trustee = '',
      nature = '',
      ownershipType = '',
      creditRatingAgency = '',
      dealSize = '',
      listingStatus = '',
      securityType = '',
      modeOfIssue = ''
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const formatDateForSQL = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDateForSQL(currentStartDate);
    const cyEnd = formatDateForSQL(currentEndDate);

    const agencyId = id ? Number(id) : null;
    const isDrillDown = agencyId !== null && !isNaN(agencyId) && agencyId > 0;

    // ─── Helper: Build multi-value IN clause ───
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // ─── Build dynamic joins & conditions based ONLY on provided filters ───
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();
      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      if (hasFilterValue(issuerName)) {
        addJoin('LEFT JOIN issuer_details ON issuer_details.id = i.issuer_master_id');
        const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(rating)) {
        const inClause = buildInClause('mir.rating', rating);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause('i.issue_size', dealSize, true);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(listingStatus)) {
        // ─── Direct joins (inner derived table removed) ───
        addJoin('LEFT JOIN master_issuer_stock_exchange mise ON mise.issuer_id = i.isin_id');
        addJoin('LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status');
        const inClause = buildInClause('mls.description', listingStatus);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(seniority)) {
        addJoin('LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = i.seniority');
        const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(taxFree)) {
        addJoin('LEFT JOIN master_tax_free ON master_tax_free.code = i.tax_free');
        const inClause = buildInClause('master_tax_free.description', taxFree);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(securedFlag)) {
        addJoin('LEFT JOIN master_secured_flag ON master_secured_flag.code = i.secured_flag');
        const inClause = buildInClause('master_secured_flag.description', securedFlag);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(sector)) {
        addJoin('LEFT JOIN master_business_sector ON master_business_sector.code = i.business_sector');
        const inClause = buildInClause('master_business_sector.description', sector);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(trustee)) {
        addJoin('LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = i.isin_id');
        addJoin('LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id');
        const inClause = buildInClause('master_trustee.short_name', trustee);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(nature)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = i.isin_id');
        addJoin('LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type');
        const inClause = buildInClause('master_issuer_type_nature.description', nature);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(ownershipType)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = i.isin_id');
        addJoin('LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type');
        const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(creditRatingAgency)) {
        const inClause = buildInClause('ma.short_name', creditRatingAgency);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(securityType)) {
        addJoin('LEFT JOIN master_security_type ON master_security_type.code = i.security_class');
        const inClause = buildInClause('master_security_type.description', securityType);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }
      if (hasFilterValue(modeOfIssue)) {
        addJoin('LEFT JOIN master_mode_issue ON master_mode_issue.code = i.mode_issue');
        const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
        if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
      }

      return { joins, conditions, params };
    };

    const { joins: filterJoins, conditions: filterConditions, params: filterParams } = buildFilterParts();

    const conditions = [`i.allotment_date BETWEEN ? AND ?  AND (i.is_visible = 1)`, ...filterConditions];
    const params = [cyStart, cyEnd, ...filterParams];

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const filterJoinsSql = filterJoins.join('\n');

    // ─── Filtered total (deduplicated to avoid join inflation) ───
    const totalQuery = `
      SELECT COUNT(DISTINCT mir.id) as aggregate 
      FROM master_issuer_rating mir
      INNER JOIN master_agency ma ON ma.id = mir.agency_id
      INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
      ${filterJoinsSql}
      ${whereClause}
    `;

    const totalResult = await prisma.$queryRawUnsafe(totalQuery, ...params);
    const totalRatingNo = Number(totalResult[0]?.aggregate) || 0;

    // ─── Main query ───
    let mainQuery = '';
    const mainParams = [...params];

    if (isDrillDown) {
      mainQuery = `
        SELECT 
          ma.short_name as label, 
          COUNT( mir.id) as rating_no,
          mir.rating 
        FROM master_agency ma
        INNER JOIN master_issuer_rating mir ON mir.agency_id = ma.id 
        INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
        ${filterJoinsSql}
        ${whereClause}
          AND ma.id = ?
        GROUP BY mir.rating, ma.short_name
      `;
      mainParams.push(agencyId);
    } else {
      mainQuery = `
        SELECT 
          ma.short_name as label, 
          COUNT( mir.id) as rating_no,
          ma.id as agency_id
        FROM master_agency ma
        INNER JOIN master_issuer_rating mir ON mir.agency_id = ma.id 
        INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
        ${filterJoinsSql}
        ${whereClause}
        GROUP BY ma.id, ma.short_name
      `;
    }

    const result = await prisma.$queryRawUnsafe(mainQuery, ...mainParams);

    const finalResult = result.map((item) => {
      const ratingNo = Number(item?.rating_no) || 0;
      const percentage = totalRatingNo > 0
        ? Number(((ratingNo / totalRatingNo) * 100).toFixed(2))
        : 0;

      return {
        name: isDrillDown ? (item?.rating || '-') : (item?.label || '-'),
        percentage,
        rating_no: ratingNo,
        color: generateColor(isDrillDown ? `${item?.label}-${item?.rating}` : item?.label),
        label: item?.label || '-',
        agencyId: isDrillDown ? agencyId : (item?.agency_id || null)
      };
    });

    res.status(200).json(finalResult);
  } catch (error) {
    console.error('Error in issuers_page_agency_rating_data:', error);
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});

app.post('/issuePage_detailed_data', async (req, res) => {
  const {
    startDate = '2025-01-01',
    endDate = '2026-01-01',
    limit = 25,
    offset = 0,
    search = ""
  } = req.body;

  try {
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    const hasFilterValue = (val) => {
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) return val.filter(v => v !== '' && v !== null && v !== undefined).length > 0;
      return String(val).trim() !== '';
    };

    const rating = toArray(req.body.rating);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const trustee = toArray(req.body.trustee);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const listingStatus = toArray(req.body.listingStatus);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 25, 1), 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const formatDateForSQL = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ─── All filter joins are ALWAYS applied (needed for SELECT columns) ───
    const allJoins = `
      INNER JOIN master_issuer m ON m.id = mi.isin_id
      LEFT JOIN issuer_details idet ON idet.id = mi.issuer_master_id
      LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint ON mint.code = m.nature_type
      LEFT JOIN master_issuer_ownership_type miot ON miot.code = m.issuer_ownership_type
      LEFT JOIN master_security_type mst ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority
      LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag
      LEFT JOIN master_tax_free mtf ON mtf.code = mi.tax_free
      LEFT JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
      LEFT JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
      LEFT JOIN master_issuer_stock_exchange mise ON mise.issuer_id = mi.isin_id
      LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
      LEFT JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
      LEFT JOIN master_trustee mt ON mt.id = it.trustee_id
      LEFT JOIN issuer_coupon_details icd ON icd.issuer_id = mi.isin_id
      LEFT JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id
      LEFT JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
      LEFT JOIN master_arranger mar ON mar.id = ia.arranger_id
    `;

    // ─── Filter conditions (against joined columns) ───
    const conditions = [`mi.allotment_date BETWEEN ? AND ?`, `mi.is_visible = 1`];
    const params = [cyStart, cyEnd];

    if (search && search.trim() !== "") {
      conditions.push(`(mi.isin LIKE ? OR idet.issuer_name LIKE ?)`);
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    if (hasFilterValue(sector)) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }
    if (hasFilterValue(nature)) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }
    if (hasFilterValue(ownershipType)) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }
    if (hasFilterValue(securityType)) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }
    if (hasFilterValue(modeOfIssue)) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }
    if (hasFilterValue(seniority)) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }
    if (hasFilterValue(securedFlag)) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }
    if (hasFilterValue(rating)) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`mir.rating IN (${ph})`);
      params.push(...rating);
    }
    if (hasFilterValue(creditRatingAgency)) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`ma.short_name IN (${ph})`);
      params.push(...creditRatingAgency);
    }
    if (hasFilterValue(listingStatus)) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`mls.description IN (${ph})`);
      params.push(...listingStatus);
    }
    if (hasFilterValue(trustee)) {
      const ph = trustee.map(() => '?').join(', ');
      conditions.push(`mt.short_name IN (${ph})`);
      params.push(...trustee);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // ─── Data query: direct joins, 1:N columns wrapped in MAX(), GROUP BY mi.id ───
    const dataQuery = `
      SELECT
        mi.id                              AS id,
        mi.isin_id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,
        MAX(idet.issuer_name)              AS issuer_name,
        MAX(mbs.description)               AS sector,
        MAX(mint.description)              AS nature,
        MAX(miot.description)              AS ownership_type,
        MAX(mst.description)               AS security_type,
        MAX(mmi.description)               AS mode_of_issue,
        MAX(mstc.description)              AS seniority,
        MAX(msf.description)               AS secured_flag,
        MAX(mtf.description)               AS tax_free,
        MAX(mls.description)               AS listing_status,
        MAX(icd.coupon_rate)               AS coupon_rate,
        MAX(mir.rating)                    AS credit_rating,
        MAX(ma.short_name)                 AS credit_rating_agency,
        MAX(mt.short_name)                 AS debenture_trustee,
        MAX(mr.registrar_name)             AS registrar,
        MAX(mar.short_name)                AS arranger
      FROM isin_re_issuance mi
      ${allJoins}
      ${whereClause}
      GROUP BY mi.id
      ORDER BY mi.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // ─── Count query: DISTINCT because joins fan out ───
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi
      ${allJoins}
      ${whereClause}
    `;

    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult[0]?.total) || 0;

    const finalResult = result.map((item) => {
      const allotment = item?.allotment_date ? new Date(item.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item.maturity_date).toISOString().split('T')[0] : null;

      return {
        id: item?.id ?? '-',
        issuerName: item?.issuer_name ?? '-',
        isin: item?.isin ?? '-',
        securityName: item?.security_name ?? '-',
        securityType: item?.security_type ?? '-',
        modeOfIssue: item?.mode_of_issue ?? '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate !== null && item?.coupon_rate !== undefined ? item.coupon_rate : '-',
        creditRatingAgency: item?.credit_rating_agency ?? '-',
        creditRating: item?.credit_rating ?? '-',
        debentureTrustee: item?.debenture_trustee ?? '-',
        registrar: item?.registrar ?? '-',
        arranger: item?.arranger ?? '-',
        seniority: item?.seniority ?? '-',
        taxFree: item?.tax_free ?? '-',
        securedFlag: item?.secured_flag ?? '-',
        listingStatus: item?.listing_status ?? '-',
        nature: item?.nature ?? '-',
        ownershipType: item?.ownership_type ?? '-',
        sector: item?.sector ?? '-',
      };
    });

    res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + parsedLimit) < total
      }
    });
  } catch (error) {
    console.error('Error in issuePage_detailed_data:', error);
    res.status(500).json({ error: 'Failed to fetch detailed issuepage data', message: error.message });
  }
});

app.post('/issuepage_filterinputs_data', async (req, res) => {
  try {
    const { startDate = '2025-01-01', endDate = '2026-01-01' } = req.body;

    const natureType = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_issuer_type_nature.description AS nature
        FROM isin_re_issuance
        LEFT JOIN master_issuer 
          ON master_issuer.id = isin_re_issuance.isin_id
        LEFT JOIN master_issuer_type_nature 
          ON master_issuer_type_nature.code = master_issuer.nature_type
        WHERE master_issuer_type_nature.description IS NOT NULL;

      `);
    const listingStatusOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT mls.description AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL;
      `);
    const lownershipTypesOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_issuer_ownership_type.description AS ownership_type
        FROM isin_re_issuance
        LEFT JOIN master_issuer 
          ON master_issuer.id = isin_re_issuance.isin_id
        LEFT JOIN master_issuer_ownership_type
          ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
        WHERE master_issuer_ownership_type.description IS NOT NULL;
      `);
    const sectorOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_business_sector.description AS sector
        FROM isin_re_issuance
        LEFT JOIN master_business_sector 
          ON master_business_sector.code = isin_re_issuance.business_sector
        WHERE 
        isin_re_issuance.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_business_sector.description IS NOT NULL;
      `);
    const securityTypeOptions = await prisma.$queryRawUnsafe(`
      SELECT description AS security_type
      FROM master_security_type 
      WHERE is_active = 1; 
    `);
    const modeissueOptions = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT master_mode_issue.description AS mode_of_issue
      FROM isin_re_issuance
      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = isin_re_issuance.mode_issue
      WHERE master_mode_issue.description IS NOT NULL 
        AND master_mode_issue.is_active = 1;
    `);

    const creditRatingOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_issuer_rating.rating AS credit_rating
        FROM isin_re_issuance
        LEFT JOIN master_issuer_rating 
          ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
        WHERE 
        isin_re_issuance.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_issuer_rating.rating IS NOT NULL;
      `);
    const creditRatingAgencyOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_agency.short_name AS credit_rating_agency
        FROM isin_re_issuance
        LEFT JOIN master_issuer_rating 
          ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
        LEFT JOIN master_agency 
          ON master_agency.id = master_issuer_rating.agency_id
        WHERE 
         master_agency.short_name IS NOT NULL;
      `);

    const seniorityOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_seniority_tier_classification.description AS Seniority
        FROM isin_re_issuance
        LEFT JOIN master_seniority_tier_classification 
          ON master_seniority_tier_classification.code = isin_re_issuance.seniority
        WHERE 
        isin_re_issuance.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_seniority_tier_classification.description IS NOT NULL;
      `);

    const securedFlagOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_secured_flag.description AS secured_flag
        FROM isin_re_issuance
        LEFT JOIN master_secured_flag 
          ON master_secured_flag.code = isin_re_issuance.secured_flag
        WHERE 
        isin_re_issuance.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_secured_flag.description IS NOT NULL;
      `);
    const taxFreeOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_tax_free.description AS tax_free
        FROM isin_re_issuance
        LEFT JOIN master_tax_free 
          ON master_tax_free.code = isin_re_issuance.tax_free
        WHERE 
        isin_re_issuance.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_tax_free.description IS NOT NULL;
      `);
    // let filterInputsValues ={ownershipType:[],nature:[],sector:[],securityType:[],modeOfIssue:[],creditRatingAgency:[],creditRating:[],seniority:[],securedFlag:[],listingStatus:[],taxFree:[]};


    const result = {
      taxFree: taxFreeOptions?.map(item => item.tax_free),
      ownershipType: lownershipTypesOptions?.map(item => item.ownership_type),
      nature: natureType?.map(item => item.nature),
      sector: sectorOptions?.map(item => item.sector),
      securityType: securityTypeOptions?.map(item => item.security_type),
      modeOfIssue: modeissueOptions?.map(item => item.mode_of_issue),
      creditRatingAgency: creditRatingAgencyOptions?.map(item => item.credit_rating_agency),
      creditRating: creditRatingOptions?.map(item => item.credit_rating),
      seniority: seniorityOptions?.map(item => item.Seniority),
      securedFlag: securedFlagOptions?.map(item => item.secured_flag),
      listingStatus: listingStatusOptions?.map(item => item.listing_status)
    };



    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to issuepage filterinputs_data', message: error.message });
  }
});

app.post('/debt_redemption_specific_month_data', async (req, res) => {
  try {
    const { startDate, endDate, limit = 25, offset = 0 } = req.body;

    // ── VALIDATION ──
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        err: 'startDate and endDate are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        err: 'Invalid date format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        err: 'startDate must be before or equal to endDate'
      });
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        err: 'Invalid limit value'
      });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        err: 'Invalid offset value'
      });
    }

    // ── SAFE NUMBER HELPER ──
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    // ── COUNT QUERY (simplified) ──
    const countQuery = `
      SELECT COUNT(DISTINCT i.isin) AS aggregate
      FROM isin_re_issuance AS i
      WHERE i.maturity_date BETWEEN ? AND ?
        AND i.is_visible = 1
    `;

    const count = await prisma.$queryRawUnsafe(countQuery, startDate, endDate);

    // ── DATA QUERY ──
    const dataQuery = `
      SELECT 
          MIN(i.isin_id) AS id,
          i.isin,
          MIN(id.issuer_name) AS issuerName,
          MIN(i.allotment_date) AS allotmentDate,
          MIN(icd.coupon_rate) AS couponRate,
          MIN(mt.short_name) AS debentureTrustee,
          MIN(mr.short_name) AS registrar,
          MIN(i.maturity_date) AS maturityDate,
          GROUP_CONCAT(DISTINCT mir.rating) AS creditRating,
          MIN(ma.short_name) AS arranger,
          MIN(i.security_name) AS securityName,
          MIN(s.description) AS securityType,
          MIN(mi.description) AS modeOfIssue,
          MIN(i.issue_size) AS issueSize,
          MIN(i.face_value) AS faceValue,
          GROUP_CONCAT(DISTINCT mag.short_name) AS creditRatingAgency,
          MIN(mstc.description) AS seniority,
          MIN(tf.description) AS taxFree,
          MIN(msf.description) AS securedFlag,
          MIN((
              SELECT mls.description
              FROM master_issuer_stock_exchange AS mise
              LEFT JOIN master_listing_status AS mls ON mls.code = mise.listing_status
              WHERE mise.issuer_id = i.isin_id
              ORDER BY mise.listing_status
              LIMIT 1
          )) AS listingStatus
      FROM isin_re_issuance AS i
      LEFT JOIN issuer_details AS id ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi ON i.mode_issue = mi.code
      LEFT JOIN issuer_coupon_details AS icd ON i.isin_id = icd.issuer_id
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf ON msf.code = i.secured_flag
      LEFT JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
      LEFT JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      LEFT JOIN issuer_trustee AS it ON i.isin_id = it.issuer_id
      LEFT JOIN master_trustee AS mt ON it.trustee_id = mt.id
      LEFT JOIN issuer_registrar AS ir1 ON i.isin_id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr ON ir1.registrar_id = mr.id
      LEFT JOIN master_issuer_rating AS mir ON i.isin_id = mir.issuer_id
      LEFT JOIN master_agency AS mag ON mag.id = mir.agency_id
      WHERE i.maturity_date BETWEEN ? AND ?
        AND i.is_visible = 1
      GROUP BY i.isin
      ORDER BY MIN(id.issuer_name) ASC
      LIMIT ? OFFSET ?
    `;

    const monthRedemptionData = await prisma.$queryRawUnsafe(
      dataQuery,
      startDate,
      endDate,
      parsedLimit,
      parsedOffset
    );

    res.json({
      data: monthRedemptionData,
      total: safeNumber(count[0]?.aggregate)
    });

  } catch (error) {
    console.error('debt_redemption_specific_month_data error:', error);

    res.status(500).json({
      success: false,
      err: error.message
    });
  }
});


app.post('/issuer_page_monthly_summary_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31'
    } = req.body;

    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    const ownershipType = toArray(req.body.ownershipType);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const securityType = toArray(req.body.securityType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const seniority = toArray(req.body.seniority);
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const formatDateForSQL = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
    const getMonthsInRange = (start, end) => {
      const months = [];
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      const endRef = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      while (cur <= endRef) {
        months.push({ monthNo: cur.getUTCMonth() + 1, monthName: monthNames[cur.getUTCMonth()] });
        cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
      }
      return months;
    };

    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    const expectedMonths = getMonthsInRange(currentStartDate, currentEndDate);

    /* ---------------------------------
       BUILD DYNAMIC JOINS + CONDITIONS
       - All 1:N filters now use direct JOINs (inner subqueries removed)
    --------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();
      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      if (hasFilterValue(ownershipType)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = mi.isin_id');
        addJoin('LEFT JOIN master_issuer_ownership_type miot ON miot.code = master_issuer.issuer_ownership_type');
        const ph = ownershipType.map(() => '?').join(', ');
        conditions.push(`miot.description IN (${ph})`);
        params.push(...ownershipType);
      }

      if (hasFilterValue(sector)) {
        addJoin('LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector');
        const ph = sector.map(() => '?').join(', ');
        conditions.push(`mbs.description IN (${ph})`);
        params.push(...sector);
      }

      if (hasFilterValue(nature)) {
        addJoin('LEFT JOIN master_issuer ON master_issuer.id = mi.isin_id');
        addJoin('LEFT JOIN master_issuer_type_nature mint ON mint.code = master_issuer.nature_type');
        const ph = nature.map(() => '?').join(', ');
        conditions.push(`mint.description IN (${ph})`);
        params.push(...nature);
      }

      if (hasFilterValue(securityType)) {
        addJoin('LEFT JOIN master_security_type mst ON mst.code = mi.security_class');
        const ph = securityType.map(() => '?').join(', ');
        conditions.push(`mst.description IN (${ph})`);
        params.push(...securityType);
      }

      if (hasFilterValue(modeOfIssue)) {
        addJoin('LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue');
        const ph = modeOfIssue.map(() => '?').join(', ');
        conditions.push(`mmi.description IN (${ph})`);
        params.push(...modeOfIssue);
      }

      if (hasFilterValue(seniority)) {
        addJoin('LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority');
        const ph = seniority.map(() => '?').join(', ');
        conditions.push(`mstc.description IN (${ph})`);
        params.push(...seniority);
      }

      if (hasFilterValue(securedFlag)) {
        addJoin('LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag');
        const ph = securedFlag.map(() => '?').join(', ');
        conditions.push(`msf.description IN (${ph})`);
        params.push(...securedFlag);
      }

      // ── 1:N filters — now converted to direct JOINs (was EXISTS) ──
      if (hasFilterValue(rating)) {
        addJoin('LEFT JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id');
        addJoin('LEFT JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0');
        const ph = rating.map(() => '?').join(', ');
        conditions.push(`mir.rating IN (${ph})`);
        params.push(...rating);
      }

      if (hasFilterValue(creditRatingAgency)) {
        addJoin('LEFT JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id');
        addJoin('LEFT JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0');
        const ph = creditRatingAgency.map(() => '?').join(', ');
        conditions.push(`ma.short_name IN (${ph})`);
        params.push(...creditRatingAgency);
      }

      if (hasFilterValue(listingStatus)) {
        addJoin('LEFT JOIN master_issuer_stock_exchange mise ON mise.issuer_id = mi.isin_id');
        addJoin('LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status');
        const ph = listingStatus.map(() => '?').join(', ');
        conditions.push(`mls.description IN (${ph})`);
        params.push(...listingStatus);
      }

      return { joins, conditions, params };
    };

    const { joins: filterJoins, conditions: filterConditions, params: filterParams } = buildFilterParts();

    const conditions = [
      `mi.allotment_date BETWEEN ? AND ?`,
      `mi.is_visible = 1`,
      ...filterConditions
    ];
    const params = [cyStart, cyEnd, ...filterParams];

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const dynamicJoins = filterJoins.join('\n');

    /* ---------------------------------
       MAIN QUERY — same aggregations, but with fan-out risk
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)             AS issue_month_no,
        COUNT(DISTINCT mi.id)              AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                                    AS issue_size,
        SUM(mi.issue_size)                   AS actual_issue_size
      FROM isin_re_issuance mi
      ${dynamicJoins}
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,
        noOfIssue: data ? Number(data.no_of_issue ?? 0) : 0,
        issueSize: data ? Number(data.issue_size ?? 0) : 0,
        actualIssueSize: data ? Number(data.actual_issue_size ?? 0) : 0
      };
    });

    res.status(200).json({
      success: true,
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Error in issuer_page_monthly_summary_data:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard monthly issue data',
      message: error.message
    });
  }
});

app.post('/issuer_page_monthly_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2026-04-01',
      endDate = '2026-07-10',
      limit = 25,
      offset = 0,
      issuerName = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      trustee = [],
      creditRatingAgency = [],
      listingStatus = [],
      securityType = [],
      modeOfIssue = [],
      arranger = [],
      registrar = [],
      isin = []
    } = req.body;

    // ─── Helpers (were referenced but not defined in the file) ───
    const hasFilterValue = (val) => {
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) return val.filter(v => v !== '' && v !== null && v !== undefined).length > 0;
      return String(val).trim() !== '';
    };

    const formatDateForSQL = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 25, 1), 1000);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }
    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // =========================
    // HELPER: Build multi-value IN clause
    // =========================
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // =========================
    // BASE JOINS
    // All lookups are always joined so SELECT columns can reference them.
    // =========================
    const baseJoins = [
      'LEFT JOIN issuer_details id2 ON id2.id = i.issuer_master_id',
      'LEFT JOIN master_seniority_tier_classification mstc2 ON mstc2.code = i.seniority',
      'LEFT JOIN master_tax_free mtf2 ON mtf2.code = i.tax_free',
      'LEFT JOIN master_secured_flag msf2 ON msf2.code = i.secured_flag',
      'LEFT JOIN master_security_type mst2 ON mst2.code = i.security_class',
      'LEFT JOIN master_mode_issue mmi2 ON mmi2.code = i.mode_issue',
      'LEFT JOIN issuer_coupon_details icd2 ON icd2.issuer_id = i.isin_id',
      'LEFT JOIN master_issuer_rating mir2 ON mir2.issuer_id = i.isin_id',
      'LEFT JOIN master_agency mag2 ON mag2.id = mir2.agency_id',
      'LEFT JOIN master_issuer_stock_exchange mise2 ON mise2.issuer_id = i.isin_id',
      'LEFT JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status',
      'LEFT JOIN issuer_trustee it2 ON it2.issuer_id = i.isin_id',
      'LEFT JOIN master_trustee mt2 ON mt2.id = it2.trustee_id',
      'LEFT JOIN issuer_arranger ia2 ON ia2.issuer_id = i.isin_id',
      'LEFT JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id',
      'LEFT JOIN issuer_registrar ir2 ON ir2.issuer_id = i.isin_id',
      'LEFT JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id'
    ];

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // All filters now reference joined columns (no EXISTS subqueries).
    // =========================
    const conditions = [];
    const params = [];

    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);
    conditions.push(`i.is_visible = 1`);

    if (hasFilterValue(issuerName)) {
      const inClause = buildInClause('id2.issuer_name', issuerName, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(isin)) {
      const inClause = buildInClause('i.isin', isin, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(rating)) {
      const inClause = buildInClause('mir2.rating', rating);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(seniority)) {
      const inClause = buildInClause('mstc2.description', seniority);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(taxFree)) {
      const inClause = buildInClause('mtf2.description', taxFree);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(securedFlag)) {
      const inClause = buildInClause('msf2.description', securedFlag);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(trustee)) {
      const inClause = buildInClause('mt2.short_name', trustee, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(creditRatingAgency)) {
      // preserve original scope: only top-level agencies (parent_id = 0)
      const inClause = buildInClause('mag2.short_name', creditRatingAgency);
      if (inClause) {
        conditions.push(`mag2.parent_id = 0 AND ${inClause.clause}`);
        params.push(...inClause.params);
      }
    }

    if (hasFilterValue(listingStatus)) {
      const inClause = buildInClause('mls2.description', listingStatus);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(securityType)) {
      const inClause = buildInClause('mst2.description', securityType);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(modeOfIssue)) {
      const inClause = buildInClause('mmi2.description', modeOfIssue);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(arranger)) {
      const inClause = buildInClause('ma2.short_name', arranger, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    if (hasFilterValue(registrar)) {
      const inClause = buildInClause('mr2.short_name', registrar, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinsSql = baseJoins.join('\n');

    // =========================
    // DATA QUERY
    // Direct joins + GROUP BY collapse fan-out. GROUP_CONCAT uses DISTINCT
    // to avoid duplicate rating/agency values from the 1:N join.
    // =========================
    const dataQuery = `
      SELECT
        i.id                                                              AS issuerId,
        i.isin,
        MAX(id2.issuer_name)                                                   AS issuer_name,
        MAX(i.allotment_date)                                                  AS allotment_date,
        MAX(icd2.coupon_rate)                                                  AS coupon_rate,
        MAX(mt2.short_name)                                                    AS debenture_trustee_name,
        MAX(mr2.short_name)                                                    AS registrar_detail,
        MAX(i.maturity_date)                                                   AS maturity_date,
        GROUP_CONCAT(DISTINCT mir2.rating)                                     AS rating,
        MAX(ma2.short_name)                                                    AS arranger_name,
        MAX(i.security_name)                                                   AS security_name,
        MAX(mst2.description)                                                  AS security_type,
        MAX(mmi2.description)                                                  AS mode_issue,
        MAX(i.issue_size)                                                      AS issue_size,
        MAX(i.face_value)                                                      AS face_value,
        GROUP_CONCAT(DISTINCT CASE WHEN mag2.parent_id = 0 THEN mag2.short_name END) AS agency_name,
        MAX(mstc2.description)                                                 AS seniority,
        MAX(mtf2.description)                                                  AS tax_free,
        MAX(msf2.description)                                                  AS secured_flag,
        MAX(mls2.description)                                                  AS listing_status,
        MAX(i.issuer_master_id)                                                AS issuer_master_id
      FROM isin_re_issuance AS i
      ${joinsSql}
      ${whereClause}
      GROUP BY i.id, i.isin
      ORDER BY MAX(id2.issuer_name) ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — same joins, count distinct ISINs
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id, i.isin
        FROM isin_re_issuance AS i
        ${joinsSql}
        ${whereClause}
        GROUP BY i.id, i.isin
      ) AS aggregate_table
    `;

    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    const finalResult = result.map((item) => {
      const allotment = item?.allotment_date ? new Date(item.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item.maturity_date).toISOString().split('T')[0] : null;

      return {
        issuerId: item?.issuerId ?? '-',
        issuerName: item?.issuer_name ?? '-',
        isin: item?.isin ?? '-',
        securityName: item?.security_name ?? '-',
        securityType: item?.security_type ?? '-',
        modeOfIssue: item?.mode_issue ?? '-',
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate !== null && item?.coupon_rate !== undefined ? item.coupon_rate : '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        rating: item?.rating ?? '-',
        creditRatingAgency: item?.agency_name ?? '-',
        debentureTrustee: item?.debenture_trustee_name ?? '-',
        registrar: item?.registrar_detail ?? '-',
        arranger: item?.arranger_name ?? '-',
        seniority: item?.seniority ?? '-',
        taxFree: item?.tax_free ?? '-',
        securedFlag: item?.secured_flag ?? '-',
        listingStatus: item?.listing_status ?? '-'
      };
    });

    return res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + parsedLimit) < total
      }
    });

  } catch (error) {
    console.error('Error in issuer_page_monthly_detailed_data:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch issuer page detailed data',
      message: error.message
    });
  }
});

app.post('/issuePage_specific_isin_detailed_data', async (req, res) => {
  const { limit = 25, offset = 0, masterIssuerId } = req.body;

  try {
    // ─── Validate masterIssuerId ───
    if (!masterIssuerId) {
      return res.status(400).json({
        error: 'masterIssuerId is required',
        message: 'Please provide a valid masterIssuerId'
      });
    }

    // ─── Sanitize and format masterIssuerId for IN clause ───
    let issuerIds;
    if (Array.isArray(masterIssuerId)) {
      issuerIds = masterIssuerId.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0);
    } else {
      const parsed = parseInt(masterIssuerId);
      issuerIds = !isNaN(parsed) && parsed > 0 ? [parsed] : [];
    }

    if (issuerIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid masterIssuerId',
        message: 'masterIssuerId must be a positive integer or array of positive integers'
      });
    }


    const resultQuery = `
          SELECT
          -- Basic issuer info
          idet.issuer_name AS "Issuer Name",
          mi.isin AS "ISIN",
          mot.description AS "Issuer Ownership Type",
          mint.description AS "Nature Type",
          mbs.description AS "Business Sector",
          idet.issuer_former_name AS "Issuer Former Name",
          mi.security_name AS "Security Name",
          mst.description AS "Security Class",
          mi.series AS "Series",
          mi.allotment_date AS "Allotment Date",
          mi.face_value AS "Face Value",
          mi.maturity_date AS "Maturity Date",

          -- Tenure details (from issuer_tenure_details)
          itd.tenure AS "Tenure",
          itd.tenure_no_years AS "Tenure : No of Years",
          itd.tenure_no_months AS "Tenure : No of Months",
          itd.tenure_no_days AS "Tenure : No of Days",

          -- Flags and classifications
          mi.convertible_flag AS "Convertible Flag",
          mi.option_flag AS "Option Flag",
          mi.tier_classification AS "Tier Classification",
          mdc.description AS "Day Count",
          mstc.description AS "Seniority",
          msf.description AS "Secured Flag",
          mf.description AS "Compound Frequency",
          mcs.description AS "Rated Flag",
          mi.isin_desc AS "ISIN Description",
          mcta.description AS "Convertible Type A",
          mctb.description AS "Convertible Type B",
          mi.stipulation_details AS "Stipulation Details",
          mi.issue_size AS "Issue Size",
          mgt.description AS "Guaranteed Type",
          mi.guaranteed AS "Guaranteed",
          mtf.description AS "Tax Free",
          mi.if_taxable AS "If Taxable",
          mmi.description AS "Mode of Issue",
          mss.description AS "Security Status",
          mi.allotment_qty AS "Allotment Quantity",
          mpni.description AS "Perpetual Nature",
          mi.infra_category AS "Infrastructure Category",
          mi.issue_price AS "Issue Price",

          -- Coupon details (latest)
          icd.coupon_type AS "Coupon Type",
          icd.coupon_pay_date AS "Coupon Pay Date",
          icd.coupon_rate AS "Coupon Rate",

          -- Interest and frequency
          mit.description AS "Interest Type",
          mi.freq AS "Frequency",
          mi.freq_dis AS "Frequency Dis",
          mi.intratupto AS "Intra Upto",
          mi.fintrpydte AS "Interest Start Date",

          -- Call / Put
          mi.call_desc AS "Call Description",
          mi.put_desc AS "Put Description",
          mi.call_option AS "Call Option",
          mi.put_option AS "Put Option",

          -- Redemption details
          ird.redmp_premimum_date AS "Redemption Premimum Date",
          mrt.description AS "Type of Redemption",
          ird.defaultinredmptn AS "Default in Redemption",
          ird.redmp_details AS "Redemption Details",

          -- Next schedule
          mi.next_sch_date AS "Next schedule Date"

      FROM master_issuer mi

      -- Issuer details (name, former name)
      LEFT JOIN issuer_details idet
          ON mi.issuer_master_id = idet.id

      -- Master lookups (descriptions)
      LEFT JOIN master_issuer_ownership_type mot
          ON mi.issuer_ownership_type = mot.code
      LEFT JOIN master_issuer_type_nature mint
          ON mi.nature_type = mint.code
      LEFT JOIN master_business_sector mbs
          ON mi.business_sector = mbs.code
      LEFT JOIN master_security_type mst
          ON mi.security_class = mst.code
      LEFT JOIN master_day_count mdc
          ON mi.day_count = mdc.code
      LEFT JOIN master_seniority_tier_classification mstc
          ON mi.seniority = mstc.code
      LEFT JOIN master_secured_flag msf
          ON mi.secured_flag = msf.code
      LEFT JOIN master_frequency mf
          ON mi.compound_frequency = mf.code
      LEFT JOIN master_cra_status mcs
          ON mi.rated_flag = mcs.code
      LEFT JOIN master_convertible_type_a mcta
          ON mi.convertible_type_a = mcta.code
      LEFT JOIN master_convertible_type_b mctb
          ON mi.convertible_type_b = mctb.code
      LEFT JOIN master_guaranteed_type mgt
          ON mi.guaranteed_type = mgt.code
      LEFT JOIN master_tax_free mtf
          ON mi.tax_free = mtf.code
      LEFT JOIN master_mode_issue mmi
          ON mi.mode_issue = mmi.code
      LEFT JOIN master_security_status mss
          ON mi.security_status = mss.code
      LEFT JOIN master_perpetual_nature_indicator mpni
          ON mi.perpetual_nature = mpni.code
      LEFT JOIN master_interest_type mit
          ON mi.interest_type = mit.code

      -- Tenure details (assumed one row per issuer)
      LEFT JOIN issuer_tenure_details itd
          ON mi.id = itd.issuer_id

      -- Redemption details (assumed one row per issuer)
      LEFT JOIN issuer_redemption_details ird
          ON mi.id = ird.issuer_id
      LEFT JOIN master_redemption_type mrt
          ON ird.type_redmptn = mrt.code

      -- Coupon details – get the latest row by coupon_rate_date
      LEFT JOIN (
          SELECT
              issuer_id,
              coupon_type,
              coupon_pay_date,
              coupon_rate
          FROM issuer_coupon_details
          WHERE issuer_id = ?
          ORDER BY coupon_rate_date DESC
          LIMIT 1
      ) icd ON mi.id = icd.issuer_id

      WHERE mi.id = ?;
    `;


    const [result] = await Promise.all([
      prisma.$queryRawUnsafe(resultQuery, masterIssuerId, masterIssuerId),
    ]);


    res.status(200).json(result);

  } catch (error) {
    console.error('Error in issuePage_specific_isin_detailed_data:', error);
    res.status(500).json({
      error: 'Failed to fetch issuePage specific_isin_detailed_data',
      message: error.message
    });
  }
});


//updated arranger APIs DONE✅

app.post('/arrangers_page_top_arrangers_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      issueType,
      limit,
      offset = 0,

      // Filters from detailed page
      rating = "",
      registrar = "",
      arranger = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      trustee = "",
      nature = "",
      ownershipType = "",
      creditRatingAgency = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

    /* =========================================================
       VALIDATION
    ========================================================= */

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate, endDate are required'
      });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (
      isNaN(currentStartDate.getTime()) ||
      isNaN(currentEndDate.getTime())
    ) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(
      previousStartDate.getFullYear() - 1
    );

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(
      previousEndDate.getFullYear() - 1
    );

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);

    /* =========================================================
       HELPER: BUILD IN / LIKE CLAUSE
    ========================================================= */

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) && values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals
      };
    };

    /* =========================================================
       DYNAMIC FILTER JOINS
       
       IMPORTANT:
       Only add a JOIN when its corresponding filter has a value.
    ========================================================= */

    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];

      const addedJoins = new Set();

      const addJoin = (join) => {
        if (!addedJoins.has(join)) {
          addedJoins.add(join);
          joins.push(join);
        }
      };

      /* ---------------------------------------------------------
         RATING
      --------------------------------------------------------- */

      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = mi.isin_id
        `);

        const inClause = buildInClause(
          'filter_mir.rating',
          rating
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         CREDIT RATING AGENCY
      --------------------------------------------------------- */

      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);

        const inClause = buildInClause(
          'filter_ma_agency.short_name',
          creditRatingAgency
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         REGISTRAR
      --------------------------------------------------------- */

      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);

        const inClause = buildInClause(
          'filter_mr.registrar_name',
          registrar,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         ARRANGER
      --------------------------------------------------------- */

      if (hasFilterValue(arranger)) {
        addJoin(`
          LEFT JOIN issuer_arranger AS filter_ia
            ON filter_ia.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_arranger AS filter_ma
            ON filter_ma.id = filter_ia.arranger_id
        `);

        const inClause = buildInClause(
          'filter_ma.short_name',
          arranger,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SENIORITY
      --------------------------------------------------------- */

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification
            AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);

        const inClause = buildInClause(
          'filter_mstc.description',
          seniority
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         TAX FREE
      --------------------------------------------------------- */

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = mi.tax_free
        `);

        const inClause = buildInClause(
          'filter_mtf.description',
          taxFree
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECURED FLAG
      --------------------------------------------------------- */

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);

        const inClause = buildInClause(
          'filter_msf.description',
          securedFlag
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECTOR
      --------------------------------------------------------- */

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);

        const inClause = buildInClause(
          'filter_mbs.description',
          sector
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         TRUSTEE
      --------------------------------------------------------- */

      if (hasFilterValue(trustee)) {
        addJoin(`
          LEFT JOIN issuer_trustee AS filter_it
            ON filter_it.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_trustee AS filter_mt
            ON filter_mt.id = filter_it.trustee_id
        `);

        const inClause = buildInClause(
          'filter_mt.short_name',
          trustee
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         NATURE
         
         nature_type belongs to master_issuer
      --------------------------------------------------------- */

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_issuer_type_nature
            AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);

        const inClause = buildInClause(
          'filter_mitn.description',
          nature
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         OWNERSHIP TYPE
         
         issuer_ownership_type belongs to master_issuer
      --------------------------------------------------------- */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_issuer_ownership_type
            AS filter_miot
            ON filter_miot.code =
               filter_mi_ownership.issuer_ownership_type
        `);

        const inClause = buildInClause(
          'filter_miot.description',
          ownershipType
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         DEAL SIZE
      --------------------------------------------------------- */

      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause(
          'mi.issue_size',
          dealSize,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         LISTING STATUS
      --------------------------------------------------------- */

      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN (
            SELECT
              mise.issuer_id,
              MAX(mls.description) AS listing_status
            FROM master_issuer_stock_exchange mise
            LEFT JOIN master_listing_status mls
              ON mls.code = mise.listing_status
            WHERE mise.listing_status IS NOT NULL
            GROUP BY mise.issuer_id
          ) AS filter_listing_data
            ON filter_listing_data.issuer_id = mi.isin_id
        `);

        const inClause = buildInClause(
          'filter_listing_data.listing_status',
          listingStatus
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECURITY TYPE
      --------------------------------------------------------- */

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);

        const inClause = buildInClause(
          'filter_mst.description',
          securityType
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         MODE OF ISSUE
      --------------------------------------------------------- */

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);

        const inClause = buildInClause(
          'filter_mmi.description',
          modeOfIssue
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         ISIN
      --------------------------------------------------------- */

      if (hasFilterValue(isin)) {
        const inClause = buildInClause(
          'mi.isin',
          isin,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return {
        joins,
        conditions,
        params
      };
    };

    /* =========================================================
       BUILD FILTER PARTS
    ========================================================= */

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterClause =
      filterConditions.length > 0
        ? `AND ${filterConditions.join(' AND ')}`
        : '';

    const totalJoins =
      filterJoins.length > 0
        ? filterJoins.join('\n')
        : '';

    console.log('cyStart:', cyStart);
    console.log('cyEnd:', cyEnd);
    console.log('filterJoins:', filterJoins);
    console.log('filterConditions:', filterConditions);
    console.log('filterParams:', filterParams);

    /* =========================================================
       COMMON DATE CONDITION
    ========================================================= */

    const currentDateCondition = `
      mi.allotment_date BETWEEN ? AND ?
      AND mi.is_visible = 1
    `;

    /* =========================================================
       TOTALS
    ========================================================= */

    const totalIssueSizeQuery = `
      SELECT
        SUM(mi.issue_size) AS aggregate
      FROM isin_re_issuance mi

      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id

      ${totalJoins}

      WHERE
        ${currentDateCondition}
        ${filterClause}
    `;

    const totalIssuesCountQuery = `
      SELECT
        COUNT(
          DISTINCT
          ia.arranger_id,
          mi.allotment_date,
          mi.issuer_master_id
        ) AS aggregate
      FROM isin_re_issuance mi

      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id

      ${totalJoins}

      WHERE
        ${currentDateCondition}
        ${filterClause}
    `;

    const [
      totalIssueSize,
      totalIssueSizePrevYear,
      totalIssuesCountCurrYear,
      totalIssuesCountPrevYear
    ] = await Promise.all([
      prisma.$queryRawUnsafe(
        totalIssueSizeQuery,
        cyStart,
        cyEnd,
        ...filterParams
      ),

      prisma.$queryRawUnsafe(
        totalIssueSizeQuery,
        pyStart,
        pyEnd,
        ...filterParams
      ),

      prisma.$queryRawUnsafe(
        totalIssuesCountQuery,
        cyStart,
        cyEnd,
        ...filterParams
      ),

      prisma.$queryRawUnsafe(
        totalIssuesCountQuery,
        pyStart,
        pyEnd,
        ...filterParams
      )
    ]);

    const totalCyCount =
      Number(
        totalIssuesCountCurrYear[0]?.aggregate
      ) || 0;

    const totalPyCount =
      Number(
        totalIssuesCountPrevYear[0]?.aggregate
      ) || 0;

    const totalCySize =
      Number(
        totalIssueSize[0]?.aggregate
      ) || 0;

    const totalPySize =
      Number(
        totalIssueSizePrevYear[0]?.aggregate
      ) || 0;

    /* =========================================================
       MARKET SHARE DENOMINATORS
    ========================================================= */

    const cyCountDenominator =
      totalCyCount || 1;

    const pyCountDenominator =
      totalPyCount || 1;

    const cySizeDenominator =
      totalCySize
        ? totalCySize / 10000000
        : 1;

    const pySizeDenominator =
      totalPySize
        ? totalPySize / 10000000
        : 1;

    /* =========================================================
       PAGINATION
    ========================================================= */

    const safeLimit =
      limit
        ? Math.max(
          0,
          parseInt(limit, 10) || 0
        )
        : null;

    const safeOffset =
      Math.max(
        0,
        parseInt(offset, 10) || 0
      );

    const t1Limit =
      safeLimit !== null &&
        safeLimit > 0
        ? `LIMIT ${safeLimit} OFFSET ${safeOffset}`
        : '';

    /* =========================================================
       MAIN TABLE QUERY
    ========================================================= */

    let tableQuery = '';
    let tableBaseParams = [];

    if (issueType === 'count') {
      tableQuery = `
        SELECT
          t1.id,
          t1.arranger_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (t1.no_issues / ?) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (t2.no_issues / ?) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN
              (
                IFNULL(t1.no_issues, 0) +
                IFNULL(t2.no_issues, 0)
              ) = 0
            THEN 0

            ELSE ROUND(
              (
                (
                  IFNULL(t1.no_issues, 0) -
                  IFNULL(t2.no_issues, 0)
                )
                /
                (
                  IFNULL(t1.no_issues, 0) +
                  IFNULL(t2.no_issues, 0)
                )
              ) * 100,
              2
            )
          END AS yoy

        FROM (

          SELECT
            ma.id,
            ma.short_name AS arranger_name,

            COUNT(
              DISTINCT
              ia.arranger_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC,
                SUM(mi.issue_size) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

          ORDER BY arr_rank

          ${t1Limit}

        ) t1

        LEFT JOIN (

          SELECT
            ma.id,

            COUNT(
              DISTINCT
              ia.arranger_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC,
                SUM(mi.issue_size) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;

      tableBaseParams = [
        cyCountDenominator,
        pyCountDenominator,

        cyStart,
        cyEnd,
        ...filterParams,

        pyStart,
        pyEnd,
        ...filterParams
      ];

    } else {

      tableQuery = `
        SELECT
          t1.id,
          t1.arranger_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (t1.issue_size / ?) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (t2.issue_size / ?) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN
              (
                IFNULL(t1.issue_size, 0) +
                IFNULL(t2.issue_size, 0)
              ) = 0
            THEN 0

            ELSE ROUND(
              (
                (
                  IFNULL(t1.issue_size, 0) -
                  IFNULL(t2.issue_size, 0)
                )
                /
                (
                  IFNULL(t1.issue_size, 0) +
                  IFNULL(t2.issue_size, 0)
                )
              ) * 100,
              2
            )
          END AS yoy

        FROM (

          SELECT
            ma.id,
            ma.short_name AS arranger_name,

            COUNT(
              DISTINCT
              ia.arranger_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

          ORDER BY arr_rank

          ${t1Limit}

        ) t1

        LEFT JOIN (

          SELECT
            ma.id,

            COUNT(
              DISTINCT
              ia.arranger_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;

      tableBaseParams = [
        cySizeDenominator,
        pySizeDenominator,

        cyStart,
        cyEnd,
        ...filterParams,

        pyStart,
        pyEnd,
        ...filterParams
      ];
    }

    const tableResult =
      await prisma.$queryRawUnsafe(
        tableQuery,
        ...tableBaseParams
      );

    /* =========================================================
       TOTAL COUNT FOR PAGINATION
    ========================================================= */

    const totalCountQuery = `
      SELECT
        COUNT(
          DISTINCT
          ia.arranger_id,
          mi.allotment_date,
          mi.issuer_master_id
        ) AS total

      FROM isin_re_issuance mi

      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id

      ${totalJoins}

      WHERE
        mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterClause}
    `;

    const totalCountResult =
      await prisma.$queryRawUnsafe(
        totalCountQuery,
        cyStart,
        cyEnd,
        ...filterParams
      );

    const totalRecords =
      parseInt(
        totalCountResult[0]?.total
      ) || 0;

    /* =========================================================
       SECTOR BREAKUP
    ========================================================= */

    const sectorValueSelect =
      issueType === 'count'
        ? `
          COUNT(
            DISTINCT
            ia.arranger_id,
            mi.allotment_date,
            mi.issuer_master_id
          )
        `
        : `
          ROUND(
            SUM(mi.issue_size) / 10000000,
            2
          )
        `;

    const rankedArrangersSubQuery =
      issueType === 'count'
        ? `
          SELECT
            ma.id AS arranger_id,
            ma.short_name AS arranger_name,

            RANK() OVER (
              ORDER BY
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC,
                SUM(mi.issue_size) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

          ORDER BY arr_rank

          LIMIT 10
        `
        : `
          SELECT
            ma.id AS arranger_id,
            ma.short_name AS arranger_name,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  ia.arranger_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_arranger ia
            ON ia.issuer_id = mi.isin_id

          JOIN master_arranger ma
            ON ma.id = ia.arranger_id

          ${totalJoins}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterClause}

          GROUP BY
            ia.arranger_id,
            ma.id,
            ma.short_name

          ORDER BY arr_rank

          LIMIT 10
        `;

    const sectorQuery = `
      SELECT
        r.arranger_id AS id,
        r.arranger_name AS name,
        r.arr_rank,

        mbs.code,
        mbs.description,

        ${sectorValueSelect} AS value

      FROM (${rankedArrangersSubQuery}) r

      JOIN issuer_arranger ia
        ON ia.arranger_id = r.arranger_id

      JOIN isin_re_issuance mi
        ON mi.isin_id = ia.issuer_id

      JOIN master_business_sector mbs
        ON mi.business_sector = mbs.code

      ${totalJoins}

      WHERE
        mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterClause}

      GROUP BY
        r.arranger_id,
        r.arranger_name,
        r.arr_rank,
        mi.business_sector,
        mbs.code,
        mbs.description

      ORDER BY
        r.arr_rank,
        value DESC;
    `;

    const sectorParams = [
      cyStart,
      cyEnd,
      ...filterParams,

      cyStart,
      cyEnd,
      ...filterParams
    ];

    const sectorData =
      await prisma.$queryRawUnsafe(
        sectorQuery,
        ...sectorParams
      );

    /* =========================================================
       RESPONSE FORMAT
    ========================================================= */

    const finalResult =
      tableResult.map((item) => ({
        id: item.id ?? '-',

        rank:
          item.cy_arr_rank ?? '-',

        name:
          item.arranger_name ?? '-',

        currentSize:
          item.cy_issue_size ?? '-',

        currentDeals:
          item.cy_issues ?? '-',

        currentMarketShare:
          item.cy_mkt_share ?? '-',

        previousRank:
          item.py_arr_rank ?? '-',

        previousSize:
          item.py_issue_size ?? '-',

        previousDeals:
          item.py_issues ?? '-',

        previousMarketShare:
          item.py_mkt_share ?? '-',

        yoyChange:
          item.yoy ?? '-'
      }));

    const totals = {
      currentSize:
        Number(
          totalIssueSize[0]?.aggregate
        ) / 10000000 || 0,

      previousSize:
        Number(
          totalIssueSizePrevYear[0]?.aggregate
        ) / 10000000 || 0,

      currentDeals:
        Number(
          totalIssuesCountCurrYear[0]?.aggregate
        ) || 0,

      previousDeals:
        Number(
          totalIssuesCountPrevYear[0]?.aggregate
        ) || 0
    };

    /* =========================================================
       FINAL RESPONSE
    ========================================================= */

    res.status(200).json({
      tableData: finalResult,

      sectorData,

      totals,

      pagination: {
        total: totalRecords,
        limit: safeLimit || 0,
        offset: safeOffset
      }
    });

  } catch (error) {
    console.error(
      'Error in arrangers_page_top_arrangers_data:',
      error
    );

    res.status(500).json({
      error: 'Failed to fetch arrangers data',
      message: error.message
    });
  }
});

app.post('/arrangers_page_credit_rating_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      rating = "",
      registrar = "",
      arranger = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      trustee = "",
      nature = "",
      ownershipType = "",
      creditRatingAgency = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    /* ---------------- HELPER: Build multi-value IN / LIKE clause ---------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------- DYNAMIC FILTER BUILDER ----------------
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    ---------------------------------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* RATING */
      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = i.isin_id
        `);
        const c = buildInClause('filter_mir.rating', rating);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* CREDIT RATING AGENCY */
      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);
        const c = buildInClause('filter_ma_agency.short_name', creditRatingAgency);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* REGISTRAR */
      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);
        const c = buildInClause('filter_mr.registrar_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ARRANGER */
      if (hasFilterValue(arranger)) {
        addJoin(`
          LEFT JOIN issuer_arranger AS filter_ia
            ON filter_ia.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_arranger AS filter_ma
            ON filter_ma.id = filter_ia.arranger_id
        `);
        const c = buildInClause('filter_ma.short_name', arranger, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SENIORITY */
      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = i.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* TAX FREE */
      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = i.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURED FLAG */
      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = i.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECTOR */
      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = i.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* TRUSTEE */
      if (hasFilterValue(trustee)) {
        addJoin(`
          LEFT JOIN issuer_trustee AS filter_it
            ON filter_it.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_trustee AS filter_mt
            ON filter_mt.id = filter_it.trustee_id
        `);
        const c = buildInClause('filter_mt.short_name', trustee);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* NATURE (nature_type lives on master_issuer) */
      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mitn.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* OWNERSHIP TYPE (issuer_ownership_type lives on master_issuer) */
      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* DEAL SIZE */
      if (hasFilterValue(dealSize)) {
        const c = buildInClause('i.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* LISTING STATUS */
      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange AS filter_mise
            ON filter_mise.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_listing_status AS filter_mls
            ON filter_mls.code = filter_mise.listing_status
        `);
        const c = buildInClause('filter_mls.description', listingStatus);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURITY TYPE */
      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = i.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* MODE OF ISSUE */
      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = i.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISIN */
      if (hasFilterValue(isin)) {
        const c = buildInClause('i.isin', isin, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0 ? filterJoins.join('\n') : '';

    const filterSql =
      filterConditions.length > 0
        ? ' AND ' + filterConditions.join(' AND ')
        : '';

    /* ---------------- TOTALS (percentage denominator) ---------------- */
    const totalRatingQuery = `
      SELECT COUNT(master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      INNER JOIN isin_re_issuance i
        ON i.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger
        ON issuer_arranger.issuer_id = i.isin_id
      INNER JOIN master_agency
        ON master_agency.id = master_issuer_rating.agency_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
        ${filterSql}
    `;

    const totalRatingResult = await prisma.$queryRawUnsafe(
      totalRatingQuery,
      cyStart,
      cyEnd,
      ...filterParams
    );

    const totalRatingCount = Number(totalRatingResult[0]?.aggregate) || 0;
    const totalRatingNo = totalRatingCount || 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */
    const creditRatingQuery = `
      SELECT
        MAX(master_agency.short_name) AS label,
        ROUND(
          (COUNT(master_issuer_rating.id) / ?) * 100,
          2
        ) AS percentage,
        COUNT(master_issuer_rating.id) AS rating_no,
        CONCAT('#', SUBSTRING((LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)), -6)) AS color,
        GROUP_CONCAT(
          DISTINCT master_issuer_rating.rating
          ORDER BY master_issuer_rating.rating ASC
          SEPARATOR ', '
        ) AS rating
      FROM master_agency
      INNER JOIN master_issuer_rating
        ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN isin_re_issuance AS i
        ON i.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger
        ON issuer_arranger.issuer_id = i.isin_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
        ${filterSql}
      GROUP BY master_issuer_rating.rating
      ORDER BY percentage DESC, rating_no DESC
    `;

    const creditRatingResult = await prisma.$queryRawUnsafe(
      creditRatingQuery,
      totalRatingNo,
      cyStart,
      cyEnd,
      ...filterParams
    );

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.label || '-',
        percentage: totalRatingCount === 0 ? 0 : (Number(item?.percentage) || 0),
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.rating || '-'
      };
    });

    res.status(200).json(finalResult);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch arrangers credit rating data',
      message: error.message
    });
  }
});

app.post('/arrangers_page_deals_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      limit = 10,
      offset = 0,
      id,
      // Filters from detailed page (issuerName excluded)
      rating = "",
      registrar = "",
      arranger = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      trustee = "",
      nature = "",
      ownershipType = "",
      creditRatingAgency = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    if (id === undefined || id === null || id === '') {
      return res.status(400).json({ error: 'id (arranger_id) is required' });
    }

    const safeId = Number(id);
    if (isNaN(safeId) || safeId <= 0) {
      return res.status(400).json({ error: 'id must be a positive number' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    /* ---------------- DYNAMIC FILTER BUILDER ---------------- */
    const buildFilterConditions = (tableAlias = 'i') => {
      const conditions = [];
      const params = [];

      if (rating) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          WHERE mir2.issuer_id = ${tableAlias}.id AND mir2.rating = ?
        )`);
        params.push(rating);
      }

      if (creditRatingAgency) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id
          WHERE mir2.issuer_id = ${tableAlias}.id AND mag2.short_name = ?
        )`);
        params.push(creditRatingAgency);
      }

      if (registrar) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir2
          JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
          WHERE ir2.issuer_id = ${tableAlias}.id AND mr2.registrar_name LIKE ?
        )`);
        params.push(`%${registrar}%`);
      }

      if (arranger) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_arranger ia2
          JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
          WHERE ia2.issuer_id = ${tableAlias}.id AND ma2.short_name LIKE ?
        )`);
        params.push(`%${arranger}%`);
      }

      if (seniority) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_seniority_tier_classification mstc2
          WHERE mstc2.code = ${tableAlias}.seniority AND mstc2.description = ?
        )`);
        params.push(seniority);
      }

      if (taxFree) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_tax_free mtf2
          WHERE mtf2.code = ${tableAlias}.tax_free AND mtf2.description = ?
        )`);
        params.push(taxFree);
      }

      if (securedFlag) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_secured_flag msf2
          WHERE msf2.code = ${tableAlias}.secured_flag AND msf2.description = ?
        )`);
        params.push(securedFlag);
      }

      if (sector) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_business_sector mbs2
          WHERE mbs2.code = ${tableAlias}.business_sector AND mbs2.description = ?
        )`);
        params.push(sector);
      }

      if (trustee) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = ${tableAlias}.id AND mt2.short_name = ?
        )`);
        params.push(trustee);
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
          WHERE mi2.id = ${tableAlias}.isin_id AND mitn2.description = ?
        )`);
        params.push(nature);
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
          WHERE mi2.id = ${tableAlias}.isin_id AND miot2.description = ?
        )`);
        params.push(ownershipType);
      }

      if (dealSize) {
        conditions.push(`${tableAlias}.issue_size LIKE ?`);
        params.push(`%${dealSize}%`);
      }

      if (listingStatus) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = ${tableAlias}.id AND mls2.description = ?
        )`);
        params.push(listingStatus);
      }

      if (securityType) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_security_type mst2
          WHERE mst2.code = ${tableAlias}.security_class AND mst2.description = ?
        )`);
        params.push(securityType);
      }

      if (modeOfIssue) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_mode_issue mmi2
          WHERE mmi2.code = ${tableAlias}.mode_issue AND mmi2.description = ?
        )`);
        params.push(modeOfIssue);
      }

      if (isin) {
        conditions.push(`${tableAlias}.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      return { conditions, params };
    };

    const {
      conditions: filterConditions,
      params: filterParams
    } = buildFilterConditions('i');

    const filterSql = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : '';

    // Fix: Validate limit and offset
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 10));
    const safeOffset = Math.max(0, Number(offset) || 0);

    /* ---------------- TABLE QUERY ---------------- */
    // Fix: Removed all_months JOIN (was causing duplicate rows)
    // Fix: Added all non-aggregated columns to GROUP BY
    // Fix: Added DISTINCT to GROUP_CONCAT to prevent duplicates
    // Fix: Added ORDER BY inside GROUP_CONCAT for deterministic results
    const tableQuery = `
      SELECT
        i.isin_id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        icd.coupon_rate,
        mt.short_name AS debenture_trustee_name,
        mr.short_name AS registrar_detail,
        i.maturity_date,
        GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') AS rating,
        ma.short_name AS arranger_name,
        i.security_name,
        s.description AS security_type,
        mi.description AS mode_issue,
        i.issue_size,
        i.face_value,
        GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS agency_name,
        mstc.description AS seniority,
        tf.description AS tax_free,
        msf.description AS secured_flag,
        (
          SELECT mls.description
          FROM master_issuer_stock_exchange AS mise
          INNER JOIN master_listing_status AS mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.isin_id
          ORDER BY mise.listing_status ASC, mise.id ASC
          LIMIT 1
        ) AS listing_status,
        i.issuer_master_id
      FROM isin_re_issuance AS i
      LEFT JOIN issuer_details AS id ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi ON i.mode_issue = mi.code
      LEFT JOIN issuer_coupon_details AS icd ON i.isin_id = icd.issuer_id
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf ON msf.code = i.secured_flag
      LEFT JOIN issuer_trustee AS it ON i.isin_id = it.issuer_id
      LEFT JOIN master_trustee AS mt ON it.trustee_id = mt.id
      LEFT JOIN issuer_registrar AS ir1 ON i.isin_id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr ON ir1.registrar_id = mr.id
      LEFT JOIN master_issuer_rating AS mir ON i.isin_id = mir.issuer_id
      LEFT JOIN master_agency AS mag ON mag.id = mir.agency_id
      INNER JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
      INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      WHERE ia.arranger_id = ?
        AND i.allotment_date BETWEEN ? AND ?
        ${filterSql}
      GROUP BY
        i.isin_id,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        icd.coupon_rate,
        mt.short_name,
        mr.short_name,
        i.maturity_date,
        ma.short_name,
        i.security_name,
        s.description,
        mi.description,
        i.issue_size,
        i.face_value,
        mstc.description,
        tf.description,
        msf.description,
        i.issuer_master_id
      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    const tableParams = [
      safeId,
      cyStart,
      cyEnd,
      ...filterParams,
      safeLimit,
      safeOffset
    ];

    /* ---------------- COUNT QUERY ---------------- */
    // Fix: Removed all_months JOIN to match table query logic
    const countQuery = `
      SELECT COUNT(DISTINCT i.isin_id) AS total
      FROM isin_re_issuance AS i
      INNER JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
      WHERE ia.arranger_id = ?
        AND i.allotment_date BETWEEN ? AND ?
        ${filterSql}
    `;

    const countParams = [
      safeId,
      cyStart,
      cyEnd,
      ...filterParams
    ];

    const [tableResult, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(tableQuery, ...tableParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams)
    ]);

    const totalRecords = parseInt(countResult[0]?.total) || 0;

    res.status(200).json({
      tableData: tableResult,
      pagination: {
        total: totalRecords,
        limit: safeLimit,
        offset: safeOffset
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch arrangers data',
      message: error.message
    });
  }
});

app.post('/arrangerPage_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31',
      limit = 25,
      offset = 0,
      search = ""
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const rating = toArray(req.body.rating);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const trustee = toArray(req.body.trustee);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const listingStatus = toArray(req.body.listingStatus);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);

    // ── Single-select filters (strings) ──
    const arranger = req.body.arranger || "";
    const registrar = req.body.registrar || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // ---------------------
    // Dynamic WHERE conditions
    // ---------------------
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    // Ensure the ISIN has at least one arranger
    conditions.push(`
      EXISTS (
        SELECT 1 
        FROM issuer_arranger ia 
        WHERE ia.issuer_id = mi.isin_id
      )
    `);

    // Search by issuerName or ISIN (single-select LIKE)
    if (search) {
      conditions.push(`(
        EXISTS (
          SELECT 1 FROM issuer_details id2 
          WHERE id2.id = mi.issuer_master_id AND id2.issuer_name LIKE ?
        )
        OR mi.isin LIKE ?
      )`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Rating (multi-select)
    if (hasFilterValue(rating)) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        WHERE mir2.issuer_id = mi.isin_id AND mir2.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Credit Rating Agency (multi-select)
    if (hasFilterValue(creditRatingAgency)) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency mag2 ON mag2.id = mir2.agency_id
        WHERE mir2.issuer_id = mi.isin_id AND mag2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Listing Status (multi-select)
    if (hasFilterValue(listingStatus)) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2
        JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
        WHERE mise2.issuer_id = mi.isin_id AND mls2.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (hasFilterValue(seniority)) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_seniority_tier_classification mstc2
        WHERE mstc2.code = mi.seniority AND mstc2.description IN (${placeholders})
      )`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (hasFilterValue(securedFlag)) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_secured_flag msf2
        WHERE msf2.code = mi.secured_flag AND msf2.description IN (${placeholders})
      )`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (hasFilterValue(sector)) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_business_sector mbs2
        WHERE mbs2.code = mi.business_sector AND mbs2.description IN (${placeholders})
      )`);
      params.push(...sector);
    }

    // Trustee (multi-select)
    if (hasFilterValue(trustee)) {
      const placeholders = trustee.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
        WHERE it2.issuer_id = mi.isin_id AND mt2.short_name IN (${placeholders})
      )`);
      params.push(...trustee);
    }

    // Nature (multi-select)
    if (hasFilterValue(nature)) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer mi2
        JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
        WHERE mi2.id = mi.isin_id AND mitn2.description IN (${placeholders})
      )`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (hasFilterValue(ownershipType)) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer mi2
        JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
        WHERE mi2.id = mi.isin_id AND miot2.description IN (${placeholders})
      )`);
      params.push(...ownershipType);
    }

    // Security Type (multi-select)
    if (hasFilterValue(securityType)) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_security_type mst2
        WHERE mst2.code = mi.security_class AND mst2.description IN (${placeholders})
      )`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (hasFilterValue(modeOfIssue)) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_mode_issue mmi2
        WHERE mmi2.code = mi.mode_issue AND mmi2.description IN (${placeholders})
      )`);
      params.push(...modeOfIssue);
    }

    // Arranger (single-select, LIKE filter)
    if (hasFilterValue(arranger)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia2
        JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
        WHERE ia2.issuer_id = mi.isin_id AND ma2.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    // Registrar (single-select, LIKE filter)
    if (hasFilterValue(registrar)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir2
        JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
        WHERE ir2.issuer_id = mi.isin_id AND mr2.registrar_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ---------------------
    // Main data query — derived tables for 1:N relationships
    // ---------------------
    const dataQuery = `
      SELECT
        mi.id,
        mi.isin_id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,

        id.issuer_name AS issuer_name,
        miot.description AS ownership_type,
        mitn.description AS nature,
        mbs.description AS sector,
        mst.description AS security_type,
        mmi.description AS mode_of_issue,
        mstc.description AS seniority,
        msf.description AS secured_flag,

        -- 1:N relations pre-aggregated in derived tables
        cp.coupon_rate,
        a.Arranger,
        cr.credit_rating,
        cra.credit_rating_agency,
        t.debenture_trustee,
        r.Registrar,
        ls.listing_status

      FROM isin_re_issuance mi

      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id

      LEFT JOIN master_issuer m
        ON m.id = mi.isin_id

      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature mitn
        ON mitn.code = m.nature_type

      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector

      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class

      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority

      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag

      -- 1. Arrangers
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') AS Arranger
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) a ON a.issuer_id = mi.isin_id

      -- 2. Credit ratings (all ratings)
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') AS credit_rating
        FROM master_issuer_rating mir
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = mi.isin_id

      -- 3. Credit rating agencies
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS credit_rating_agency
        FROM master_issuer_rating mir
        JOIN master_agency mag ON mag.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cra ON cra.issuer_id = mi.isin_id

      -- 4. Trustees
      LEFT JOIN (
        SELECT it.issuer_id,
               GROUP_CONCAT(DISTINCT mt.short_name ORDER BY mt.short_name ASC SEPARATOR ', ') AS debenture_trustee
        FROM issuer_trustee it
        JOIN master_trustee mt ON mt.id = it.trustee_id
        GROUP BY it.issuer_id
      ) t ON t.issuer_id = mi.isin_id

      -- 5. Registrars
      LEFT JOIN (
        SELECT ir.issuer_id,
               GROUP_CONCAT(DISTINCT mr.registrar_name ORDER BY mr.registrar_name ASC SEPARATOR ', ') AS Registrar
        FROM issuer_registrar ir
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        GROUP BY ir.issuer_id
      ) r ON r.issuer_id = mi.isin_id

      -- 6. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = mi.isin_id

      -- 7. First listing status (by exchange id, then listing status, then id)
      LEFT JOIN (
        SELECT issuer_id,
               listing_status
        FROM (
          SELECT mise.issuer_id,
                 mls.description AS listing_status,
                 ROW_NUMBER() OVER (PARTITION BY mise.issuer_id ORDER BY mise.listing_status ASC, mise.id ASC) AS rn
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = mi.isin_id

      ${whereClause}

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ---------------------
    // Count query — unchanged
    // ---------------------
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi
      ${whereClause}
    `;

    // ---------------------
    // Execute queries
    // ---------------------
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    // Safe parsing with fallback
    const total = parseInt(countResult?.[0]?.total, 10) || 0;

    // ---------------------
    // Final formatting
    // ---------------------
    const finalResult = result?.map((item) => {
      const allotment = item?.allotment_date
        ? new Date(item?.allotment_date).toISOString().split('T')[0]
        : null;

      const maturity = item?.maturity_date
        ? new Date(item?.maturity_date).toISOString().split('T')[0]
        : null;

      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate ?? '-',
        creditRatingAgency: item?.credit_rating_agency || '-',
        creditRating: item?.credit_rating || '-',
        debentureTrustee: item?.debenture_trustee || '-',
        registrar: item?.Registrar || '-',
        arranger: item?.Arranger || '-',
        seniority: item?.seniority || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        nature: item?.nature || '-',
        ownershipType: item?.ownership_type || '-',
        sector: item?.sector || '-',
      };
    });

    // ---------------------
    // Response
    // ---------------------
    res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('Error in arrangerPage_detailed_data:', error);
    res.status(500).json({
      error: 'Failed to fetch arranger detailed data',
      message: error.message
    });
  }
});

app.post('/arranger_page_monthly_summary_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31'
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const ownershipType = toArray(req.body.ownershipType);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const securityType = toArray(req.body.securityType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const seniority = toArray(req.body.seniority);
    const taxFree = toArray(req.body.taxFree);
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    // ── Single-select filters (strings) ──
    const dealSize = req.body.dealSize || "";
    const arranger = req.body.arranger || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ─── Generate expected month list (chronological, includes empty months) ───
    const expectedMonths = getMonthsInRange(currentStartDate, currentEndDate);

    /* ---------------------------------
       HELPER: Build multi-value IN / LIKE clause
    --------------------------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------------------------
       DYNAMIC FILTER BUILDER
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    --------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* ── Base date / visibility ── */
      conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
      params.push(cyStart, cyEnd);
      conditions.push(`mi.is_visible = 1`);

      /* ── 1:N relationship filters (EXISTS = no row multiplication, no joins) ── */

      if (hasFilterValue(rating)) {
        const c = buildInClause('mir.rating', rating);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(creditRatingAgency)) {
        const c = buildInClause('ma.short_name', creditRatingAgency);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(listingStatus)) {
        const c = buildInClause('mls.description', listingStatus);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise
            JOIN master_listing_status mls ON mls.code = mise.listing_status
            WHERE mise.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      /* ── Direct conditions (no join needed) ── */

      if (hasFilterValue(dealSize)) {
        const c = buildInClause('mi.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ── 1:1 lookup filters (dynamic JOINs, added only when needed) ── */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mint
            ON filter_mint.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mint.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = mi.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(arranger)) {
        addJoin(`
          LEFT JOIN master_arranger AS filter_ma2
            ON filter_ma2.id = ia.arranger_id
        `);
        const c = buildInClause('filter_ma2.short_name', arranger, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql = filterJoins.length > 0 ? filterJoins.join('\n') : '';
    const whereClause = filterConditions.length
      ? `WHERE ${filterConditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT subquery
       - No 1:N LEFT JOINs (ratings, listing_status handled via EXISTS)
       - Only filters with values contribute their JOINs
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.id, '-', ia.arranger_id)) AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                            AS issue_size,
        SUM(mi.issue_size)           AS actual_issue_size
      FROM isin_re_issuance mi
      INNER JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      ${filterJoinsSql}
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...filterParams);

    // ─── Merge SQL results with expected month list (includes empty months) ───
    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,
        noOfIssue: data ? Number(data.no_of_issue ?? 0) : 0,
        issueSize: data ? Number(data.issue_size ?? 0) : 0,
        actualIssueSize: data ? Number(data.actual_issue_size ?? 0) : 0
      };
    });

    res.status(200).json({
      success: true,
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Error in arranger_page_monthly_summary_data:', error);
    res.status(500).json({
      error: 'Failed to fetch arranger monthly summary data',
      message: error.message
    });
  }
});

app.post('/arrangers_page_monthly_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2026-04-01',
      endDate = '2026-05-28',
      month = "",
      limit = 25,
      offset = 0,
      arranger = "",
      issuerName = "",
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      trustee = [],
      creditRatingAgency = [],
      listingStatus = [],
      securityType = [],
      modeOfIssue = [],
      registrar = [],
      isin = [],
      sector = [],
      nature = [],
      ownershipType = []
    } = req.body;

    // Fix: Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    // Fix: Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Fix: Validate month if provided
    const safeMonth = month !== "" ? parseInt(month, 10) : null;
    if (safeMonth !== null && (isNaN(safeMonth) || safeMonth < 1 || safeMonth > 12)) {
      return res.status(400).json({
        success: false,
        error: 'month must be between 1 and 12'
      });
    }

    // =========================
    // HELPER: Build multi-value IN clause
    // =========================
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================
    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Arranger filter (LIKE search)
    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger) ? arranger : [arranger];
      const inClause = buildInClause('ma2.short_name', arrangerValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_arranger ia2
          JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
          WHERE ia2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Issuer Name filter (LIKE search)
    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName) ? issuerName : [issuerName];
      const inClause = buildInClause('id2.issuer_name', issuerNameValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_details id2
          WHERE id2.id = i.issuer_master_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // ISIN filter (LIKE search)
    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating) ? rating : [rating];
      const inClause = buildInClause('mir2.rating', ratingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Seniority filter
    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority) ? seniority : [seniority];
      const inClause = buildInClause('mstc2.description', seniorityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_seniority_tier_classification mstc2
          WHERE mstc2.code = i.seniority AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Tax Free filter
    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree) ? taxFree : [taxFree];
      const inClause = buildInClause('mtf2.description', taxFreeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_tax_free mtf2
          WHERE mtf2.code = i.tax_free AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Secured Flag filter
    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag) ? securedFlag : [securedFlag];
      const inClause = buildInClause('msf2.description', securedFlagValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_secured_flag msf2
          WHERE msf2.code = i.secured_flag AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Trustee filter
    if (hasFilterValue(trustee)) {
      const trusteeValue = Array.isArray(trustee) ? trustee : [trustee];
      const inClause = buildInClause('mt2.short_name', trusteeValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Credit Rating Agency filter
    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency) ? creditRatingAgency : [creditRatingAgency];
      const inClause = buildInClause('mag2.short_name', agencyValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Listing Status filter
    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus) ? listingStatus : [listingStatus];
      const inClause = buildInClause('mls2.description', listingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Security Type filter
    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType) ? securityType : [securityType];
      const inClause = buildInClause('mst2.description', securityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_security_type mst2
          WHERE mst2.code = i.security_class AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Mode of Issue filter
    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue) ? modeOfIssue : [modeOfIssue];
      const inClause = buildInClause('mmi2.description', modeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_mode_issue mmi2
          WHERE mmi2.code = i.mode_issue AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Registrar filter
    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar) ? registrar : [registrar];
      const inClause = buildInClause('mr2.short_name', registrarValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir2
          JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
          WHERE ir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Sector filter
    if (hasFilterValue(sector)) {
      const sectorValue = Array.isArray(sector) ? sector : [sector];
      const inClause = buildInClause('mbs2.description', sectorValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_business_sector mbs2
          WHERE mbs2.code = i.business_sector AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Nature filter
    if (hasFilterValue(nature)) {
      const natureValue = Array.isArray(nature) ? nature : [nature];
      const inClause = buildInClause('mitn2.description', natureValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
          WHERE mi2.id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Ownership Type filter
    if (hasFilterValue(ownershipType)) {
      const ownershipValue = Array.isArray(ownershipType) ? ownershipType : [ownershipType];
      const inClause = buildInClause('miot2.description', ownershipValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
          WHERE mi2.id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY — derived tables for 1:N relationships
    // =========================
    const dataQuery = `
      SELECT
        i.id                              AS issuerId,
        ia.arranger_id                    AS arranger_id,
        ma.short_name                     AS arranger_name,
        i.isin                            AS isin,
        id.issuer_name                    AS issuer_name,
        i.allotment_date                  AS allotment_date,
        i.maturity_date                   AS maturity_date,
        i.security_name                   AS security_name,
        i.issue_size                      AS issue_size,
        i.face_value                      AS face_value,
        i.issuer_master_id                AS issuer_master_id,

        s.description                     AS security_type,
        mi.description                    AS mode_issue,
        mstc.description                  AS seniority,
        tf.description                    AS tax_free,
        msf.description                   AS secured_flag,

        -- pre-aggregated 1:N relations
        cp.coupon_rate,
        t.debenture_trustee_name,
        r.registrar_detail,
        cr.rating,
        cr.agency_name,
        ls.listing_status

      FROM isin_re_issuance AS i

      INNER JOIN issuer_arranger  AS ia ON i.isin_id = ia.issuer_id
      INNER JOIN master_arranger  AS ma ON ia.arranger_id = ma.id

      LEFT JOIN issuer_details    AS id   ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s  ON i.security_class = s.code
      LEFT JOIN master_mode_issue    AS mi ON i.mode_issue = mi.code
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free      AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag  AS msf ON msf.code = i.secured_flag

      -- 1. First coupon rate (by issuer id — safe fallback)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.issuer_id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = i.isin_id

      -- 2. First trustee (by master_trustee id)
      LEFT JOIN (
        SELECT issuer_id, short_name AS debenture_trustee_name
        FROM (
          SELECT it.issuer_id,
                 mt.short_name,
                 ROW_NUMBER() OVER (PARTITION BY it.issuer_id ORDER BY mt.id) AS rn
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
        ) x
        WHERE x.rn = 1
      ) t ON t.issuer_id = i.isin_id

      -- 3. First registrar (by master_registrar id)
      LEFT JOIN (
        SELECT issuer_id, short_name AS registrar_detail
        FROM (
          SELECT ir.issuer_id,
                 mr.short_name,
                 ROW_NUMBER() OVER (PARTITION BY ir.issuer_id ORDER BY mr.id) AS rn
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
        ) x
        WHERE x.rn = 1
      ) r ON r.issuer_id = i.isin_id

      -- 4. Ratings + agencies (all values)
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT mir.rating    ORDER BY mir.rating    ASC SEPARATOR ', ') AS rating,
               GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS agency_name
        FROM master_issuer_rating mir
        JOIN master_agency mag ON mag.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = i.isin_id

      -- 5. First listing status (by listing_status then issuer)
      LEFT JOIN (
        SELECT issuer_id, listing_status
        FROM (
          SELECT mise.issuer_id,
                 mls.description AS listing_status,
                 ROW_NUMBER() OVER (
                   PARTITION BY mise.issuer_id
                   ORDER BY mise.listing_status ASC, mise.issuer_id ASC
                 ) AS rn
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = i.isin_id

      ${whereClause}

      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — no 1:N joins, accurate count
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id, ia.arranger_id
        FROM isin_re_issuance AS i
        INNER JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
        INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
        ${whereClause}
        GROUP BY i.id, ia.arranger_id, ma.short_name, i.isin
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = parseInt(countResult?.[0]?.total, 10) || 0;

    // =========================
    // FORMAT RESPONSE
    // =========================
    const finalResult = result?.map((item) => {
      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date).toISOString().split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date).toISOString().split('T')[0]
        : '-';

      return {
        issuerId: item?.issuerId || '-',
        arrangerId: item?.arranger_id || '-',
        arranger: item?.arranger_name || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || '-',
        allotmentDate,
        maturityDate,
        couponRate: item?.coupon_rate ?? '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        rating: item?.rating || '-',
        creditRatingAgency: item?.agency_name || '-',
        debentureTrustee: item?.debenture_trustee_name || '-',
        registrar: item?.registrar_detail || '-',
        seniority: item?.seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        issuerMasterId: item?.issuer_master_id || '-'
      };
    });

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('arrangers_page_monthly_detailed_data Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch arrangers monthly detailed data',
      message: error.message
    });
  }
});

app.post('/arranger_top_participants_details', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      arrangerId,
      SearchQuery = '',
      limit = 25,
      offset = 0,
      sortField = 'issuer_name',
      sortOrder = 'ASC',

      // ── Filters ──
      ownershipType = [],
      nature = [],
      sector = [],
      securityType = [],
      modeOfIssue = [],
      creditRatingAgency = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      listingStatus = [],
      registrar = [],
      trustee = [],
      isin = [],
      issuerName = [],
    } = req.body;

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!startDate || !endDate || !arrangerId) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and arrangerId are required',
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (
      isNaN(startDateObj.getTime()) ||
      isNaN(endDateObj.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    const safeArrangerId = Number(arrangerId);

    if (
      isNaN(safeArrangerId) ||
      safeArrangerId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'arrangerId must be a positive number',
      });
    }

    const safeLimit = Math.max(
      1,
      Math.min(1000, Number(limit) || 25)
    );

    const safeOffset = Math.max(
      0,
      Number(offset) || 0
    );

    // ============================================================
    // SORTING
    // ============================================================

    const validSortFields = [
      'issuer_name',
      'isin',
      'allotment_date',
      'maturity_date',
      'coupon_rate',
      'issue_size',
      'face_value',
      'security_name',
      'rating',
      'agency_name',
      'listing_status',
    ];

    const orderBy = validSortFields.includes(sortField)
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // ============================================================
    // SEARCH
    // ============================================================

    const safeSearchQuery = SearchQuery?.trim() || '';

    const escapeLike = (str) =>
      str.replace(/[%_\\]/g, '\\$&');

    const searchPattern = safeSearchQuery
      ? `%${escapeLike(safeSearchQuery)}%`
      : null;

    // ============================================================
    // HELPER: BUILD IN CLAUSE
    // ============================================================

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) && values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params,
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals,
      };
    };

    // ============================================================
    // BUILD DYNAMIC CONDITIONS
    // ============================================================

    const conditions = [];
    const params = [];

    // ------------------------------------------------------------
    // Required filters
    // ------------------------------------------------------------

    conditions.push(`i.is_visible = 1`);

    conditions.push(`ia.arranger_id = ?`);
    params.push(safeArrangerId);

    conditions.push(
      `i.allotment_date BETWEEN ? AND ?`
    );

    params.push(
      `${startDate} 00:00:00`,
      `${endDate} 23:59:59`
    );

    // ============================================================
    // OWNERSHIP TYPE
    // ============================================================

    if (hasFilterValue(ownershipType)) {
      const ownershipValue = Array.isArray(ownershipType)
        ? ownershipType
        : [ownershipType];

      const inClause = buildInClause(
        'miot2.description',
        ownershipValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2
              ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // NATURE
    // ============================================================

    if (hasFilterValue(nature)) {
      const natureValue = Array.isArray(nature)
        ? nature
        : [nature];

      const inClause = buildInClause(
        'mitn2.description',
        natureValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2
              ON mitn2.code = mi2.nature_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // SECTOR
    // ============================================================

    if (hasFilterValue(sector)) {
      const sectorValue = Array.isArray(sector)
        ? sector
        : [sector];

      const inClause = buildInClause(
        'mbs2.description',
        sectorValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_business_sector mbs2
            WHERE mbs2.code = i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // SECURITY TYPE
    // ============================================================

    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType)
        ? securityType
        : [securityType];

      const inClause = buildInClause(
        'mst2.description',
        securityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_security_type mst2
            WHERE mst2.code = i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // MODE OF ISSUE
    // ============================================================

    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue)
        ? modeOfIssue
        : [modeOfIssue];

      const inClause = buildInClause(
        'mmi2.description',
        modeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_mode_issue mmi2
            WHERE mmi2.code = i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // CREDIT RATING AGENCY
    // ============================================================

    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency)
        ? creditRatingAgency
        : [creditRatingAgency];

      const inClause = buildInClause(
        'mag2.short_name',
        agencyValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            JOIN master_agency mag2
              ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // RATING
    // ============================================================

    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating)
        ? rating
        : [rating];

      const inClause = buildInClause(
        'mir2.rating',
        ratingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // SENIORITY
    // ============================================================

    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority)
        ? seniority
        : [seniority];

      const inClause = buildInClause(
        'mstc2.description',
        seniorityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // TAX FREE
    // ============================================================

    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree)
        ? taxFree
        : [taxFree];

      const inClause = buildInClause(
        'mtf2.description',
        taxFreeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_tax_free mtf2
            WHERE mtf2.code = i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // SECURED FLAG
    // ============================================================

    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag)
        ? securedFlag
        : [securedFlag];

      const inClause = buildInClause(
        'msf2.description',
        securedFlagValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_secured_flag msf2
            WHERE msf2.code = i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // LISTING STATUS
    // ============================================================

    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus)
        ? listingStatus
        : [listingStatus];

      const inClause = buildInClause(
        'mls2.description',
        listingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2
              ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // REGISTRAR
    // ============================================================

    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar)
        ? registrar
        : [registrar];

      const inClause = buildInClause(
        'mr2.short_name',
        registrarValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_registrar ir2
            JOIN master_registrar mr2
              ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // TRUSTEE
    // ============================================================

    if (hasFilterValue(trustee)) {
      const trusteeValue = Array.isArray(trustee)
        ? trustee
        : [trustee];

      const inClause = buildInClause(
        'mt2.short_name',
        trusteeValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_trustee it2
            JOIN master_trustee mt2
              ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ============================================================
    // ISIN
    // ============================================================

    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin)
        ? isin
        : [isin];

      const inClause = buildInClause(
        'i.isin',
        isinValue,
        true
      );

      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // ============================================================
    // ISSUER NAME
    // ============================================================

    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName)
        ? issuerName
        : [issuerName];

      const inClause = buildInClause(
        'id2.issuer_name',
        issuerNameValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_details id2
            WHERE id2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    const whereClause = conditions.join(' AND ');

    // ============================================================
    // BASE QUERY
    // ============================================================

    const baseQuery = `
      SELECT
        i.id AS issuerId,
        i.isin,

        ANY_VALUE(id.issuer_name) AS issuer_name,

        ANY_VALUE(i.allotment_date) AS allotment_date,

        ANY_VALUE(icd.coupon_rate) AS coupon_rate,

        ANY_VALUE(mt.short_name) AS debenture_trustee_name,

        ANY_VALUE(mr.short_name) AS registrar_detail,

        ANY_VALUE(i.maturity_date) AS maturity_date,

        GROUP_CONCAT(mir.rating) AS rating,

        ANY_VALUE(ma.short_name) AS arranger_name,

        ANY_VALUE(i.security_name) AS security_name,

        ANY_VALUE(s.description) AS security_type,

        ANY_VALUE(mi.description) AS mode_issue,

        ANY_VALUE(i.issue_size) AS issue_size,

        ANY_VALUE(i.face_value) AS face_value,

        GROUP_CONCAT(mag.short_name) AS agency_name,

        ANY_VALUE(mstc.description) AS seniority,

        ANY_VALUE(tf.description) AS tax_free,

        ANY_VALUE(msf.description) AS secured_flag,

        (
          SELECT description
          FROM master_issuer_stock_exchange AS mise
          LEFT JOIN master_listing_status AS mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status,

        ANY_VALUE(i.issuer_master_id) AS issuer_master_id

      FROM all_months

      INNER JOIN isin_re_issuance AS i
        ON all_months.month_no = MONTH(i.allotment_date)

      LEFT JOIN issuer_details AS id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
        ON i.mode_issue = mi.code

      LEFT JOIN issuer_coupon_details AS icd
        ON i.isin_id = icd.issuer_id

      LEFT JOIN master_seniority_tier_classification AS mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
        ON msf.code = i.secured_flag

      LEFT JOIN issuer_trustee AS it
        ON i.isin_id = it.issuer_id

      LEFT JOIN master_trustee AS mt
        ON it.trustee_id = mt.id

      LEFT JOIN issuer_registrar AS ir1
        ON i.isin_id = ir1.issuer_id

      LEFT JOIN master_registrar AS mr
        ON ir1.registrar_id = mr.id

      LEFT JOIN master_issuer_rating AS mir
        ON i.isin_id = mir.issuer_id

      LEFT JOIN master_agency AS mag
        ON mag.id = mir.agency_id

      INNER JOIN issuer_arranger AS ia
        ON i.isin_id = ia.issuer_id

      INNER JOIN master_arranger AS ma
        ON ia.arranger_id = ma.id

      WHERE ${whereClause}

      GROUP BY
        ia.arranger_id,
        i.isin,
        i.id
    `;

    // ============================================================
    // SEARCH CONDITION
    // ============================================================

    const searchWhereClause = `
      (
        issuer_name LIKE ?

        OR isin LIKE ?

        OR CAST(coupon_rate AS CHAR) LIKE ?

        OR debenture_trustee_name LIKE ?

        OR registrar_detail LIKE ?

        OR rating LIKE ?

        OR arranger_name LIKE ?

        OR security_name LIKE ?

        OR security_type LIKE ?

        OR mode_issue LIKE ?

        OR CAST(issue_size AS CHAR) LIKE ?

        OR CAST(face_value AS CHAR) LIKE ?

        OR agency_name LIKE ?

        OR seniority LIKE ?

        OR tax_free LIKE ?

        OR secured_flag LIKE ?

        OR listing_status LIKE ?
      )
    `;

    const searchParams = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    ];

    // ============================================================
    // DATA QUERY
    // ============================================================

    let dataQuery = baseQuery;
    const dataParams = [...params];

    if (searchPattern) {
      dataQuery = `
        SELECT *
        FROM (${baseQuery}) x
        WHERE ${searchWhereClause}
      `;

      dataParams.push(...searchParams);
    }

    dataQuery += `
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    dataParams.push(
      safeLimit,
      safeOffset
    );

    // ============================================================
    // TOTAL COUNT
    // ============================================================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
    `;

    const countParams = [...params];

    if (searchPattern) {
      countQuery = `
        SELECT COUNT(*) AS total
        FROM (${baseQuery}) x
        WHERE ${searchWhereClause}
      `;

      countParams.push(...searchParams);
    }

    // ============================================================
    // CLUBBED COUNT
    // ============================================================

    let clubbedCountQuery = `
      SELECT COUNT(*) AS clubbedTotal
      FROM (
        SELECT
          issuer_name,
          DATE(allotment_date) AS allotment_date
        FROM (${baseQuery}) x
        GROUP BY
          issuer_name,
          DATE(allotment_date)
      ) clubbed
    `;

    const clubbedCountParams = [...params];

    if (searchPattern) {
      clubbedCountQuery = `
        SELECT COUNT(*) AS clubbedTotal
        FROM (
          SELECT
            issuer_name,
            DATE(allotment_date) AS allotment_date
          FROM (${baseQuery}) x
          WHERE ${searchWhereClause}
          GROUP BY
            issuer_name,
            DATE(allotment_date)
        ) clubbed
      `;

      clubbedCountParams.push(...searchParams);
    }

    // ============================================================
    // EXECUTE QUERIES
    // ============================================================

    const [
      data,
      totalCount,
      clubbedCount,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(
        dataQuery,
        ...dataParams
      ),

      prisma.$queryRawUnsafe(
        countQuery,
        ...countParams
      ),

      prisma.$queryRawUnsafe(
        clubbedCountQuery,
        ...clubbedCountParams
      ),
    ]);

    // ============================================================
    // FORMAT RESPONSE
    // ============================================================

    const formattedData = data?.map((item) => ({
      issuerId: item?.issuerId ?? '-',
      isin: item?.isin ?? '-',
      issuerName: item?.issuer_name ?? '-',

      allotmentDate: item?.allotment_date
        ? new Date(item.allotment_date).toISOString().split('T')[0]
        : '-',

      couponRate: item?.coupon_rate ?? '-',
      debentureTrusteeName: item?.debenture_trustee_name ?? '-',
      registrarDetail: item?.registrar_detail ?? '-',

      maturityDate: item?.maturity_date
        ? new Date(item.maturity_date).toISOString().split('T')[0]
        : '-',

      rating: item?.rating ?? '-',
      arrangerName: item?.arranger_name ?? '-',
      securityName: item?.security_name ?? '-',
      securityType: item?.security_type ?? '-',
      modeIssue: item?.mode_issue ?? '-',
      issueSize: item?.issue_size ?? null,
      faceValue: item?.face_value ?? null,
      agencyName: item?.agency_name ?? '-',
      seniority: item?.seniority ?? '-',
      taxFree: item?.tax_free ?? '-',
      securedFlag: item?.secured_flag ?? '-',
      listingStatus: item?.listing_status ?? '-',
      issuerMasterId: item?.issuer_master_id ?? '-',
    }));

    // ============================================================
    // RESPONSE
    // ============================================================

    return res.json({
      success: true,

      // Number of individual baseQuery records
      totalRecords: Number(totalCount?.[0]?.total || 0),

      // Number of unique issuer_name + allotment_date groups
      clubbedTotalRecords: Number(
        clubbedCount?.[0]?.clubbedTotal || 0
      ),

      data: formattedData,
    });

  } catch (error) {
    console.error(
      'arranger_top_participants_details error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

//updated trustee APIs DONE

app.post('/trustees_page_top_trustees_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      issueType,
      limit,
      offset = 0,

      rating = "",
      registrar = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      trustee = "",
      nature = "",
      ownershipType = "",
      creditRatingAgency = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

    /* =========================================================
       VALIDATION
    ========================================================= */

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate, endDate are required'
      });
    }

    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const parsedOffset = parseInt(offset, 10) || 0;

    if (
      parsedLimit !== null &&
      (isNaN(parsedLimit) || parsedLimit < 0)
    ) {
      return res.status(400).json({
        error: 'limit must be a non-negative integer'
      });
    }

    if (
      isNaN(parsedOffset) ||
      parsedOffset < 0
    ) {
      return res.status(400).json({
        error: 'offset must be a non-negative integer'
      });
    }

    /* =========================================================
       DATE CALCULATIONS
    ========================================================= */

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (
      isNaN(currentStartDate.getTime()) ||
      isNaN(currentEndDate.getTime())
    ) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(
      previousStartDate.getFullYear() - 1
    );

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(
      previousEndDate.getFullYear() - 1
    );

    const formatDate = (date) =>
      date.toISOString()
        .slice(0, 19)
        .replace('T', ' ');

    const formatDateTime = (
      dateStr,
      isEnd = false
    ) => {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return null;
      }

      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }

      return date.toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const cyStart = formatDateTime(currentStartDate);
    const cyEnd = formatDateTime(currentEndDate);

    const pyStart = formatDateTime(previousStartDate);
    const pyEnd = formatDateTime(previousEndDate);

    /* =========================================================
       HELPER: BUILD MULTI-VALUE IN / LIKE CLAUSE
    ========================================================= */

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) &&
          values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals
      };
    };

    /* =========================================================
       DYNAMIC FILTER BUILDER

       Only add a JOIN when the corresponding filter
       actually contains a value.

       hasFilterValue() is defined outside this API.
    ========================================================= */

    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];

      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();

        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* ---------------------------------------------------------
         RATING
      --------------------------------------------------------- */

      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = mi.isin_id
        `);

        const inClause = buildInClause(
          'filter_mir.rating',
          rating
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         CREDIT RATING AGENCY
      --------------------------------------------------------- */

      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id =
               filter_mir_agency.agency_id
        `);

        const inClause = buildInClause(
          'filter_ma_agency.short_name',
          creditRatingAgency
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         REGISTRAR
      --------------------------------------------------------- */

      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id =
               filter_ir.registrar_id
        `);

        const inClause = buildInClause(
          'filter_mr.registrar_name',
          registrar,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SENIORITY
      --------------------------------------------------------- */

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification
            AS filter_mstc
            ON filter_mstc.code =
               mi.seniority
        `);

        const inClause = buildInClause(
          'filter_mstc.description',
          seniority
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         TAX FREE
      --------------------------------------------------------- */

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code =
               mi.tax_free
        `);

        const inClause = buildInClause(
          'filter_mtf.description',
          taxFree
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECURED FLAG
      --------------------------------------------------------- */

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code =
               mi.secured_flag
        `);

        const inClause = buildInClause(
          'filter_msf.description',
          securedFlag
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECTOR
      --------------------------------------------------------- */

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code =
               mi.business_sector
        `);

        const inClause = buildInClause(
          'filter_mbs.description',
          sector
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         TRUSTEE
         
         This JOIN is added only when trustee filter is present.
      --------------------------------------------------------- */

      if (hasFilterValue(trustee)) {
        addJoin(`
          LEFT JOIN issuer_trustee AS filter_it
            ON filter_it.issuer_id =
               mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_trustee AS filter_mt
            ON filter_mt.id =
               filter_it.trustee_id
        `);

        const inClause = buildInClause(
          'filter_mt.short_name',
          trustee,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         NATURE

         nature_type is on master_issuer.
      --------------------------------------------------------- */

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id =
               mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_issuer_type_nature
            AS filter_mitn
            ON filter_mitn.code =
               filter_mi_nature.nature_type
        `);

        const inClause = buildInClause(
          'filter_mitn.description',
          nature
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         OWNERSHIP TYPE

         issuer_ownership_type is on master_issuer.
      --------------------------------------------------------- */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id =
               mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_issuer_ownership_type
            AS filter_miot
            ON filter_miot.code =
               filter_mi_ownership.issuer_ownership_type
        `);

        const inClause = buildInClause(
          'filter_miot.description',
          ownershipType
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         DEAL SIZE
      --------------------------------------------------------- */

      if (hasFilterValue(dealSize)) {
        const inClause = buildInClause(
          'mi.issue_size',
          dealSize,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         LISTING STATUS
      --------------------------------------------------------- */

      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange
            AS filter_mise
            ON filter_mise.issuer_id =
               mi.isin_id
        `);

        addJoin(`
          LEFT JOIN master_listing_status
            AS filter_mls
            ON filter_mls.code =
               filter_mise.listing_status
        `);

        const inClause = buildInClause(
          'filter_mls.description',
          listingStatus
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         SECURITY TYPE
      --------------------------------------------------------- */

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type
            AS filter_mst
            ON filter_mst.code =
               mi.security_class
        `);

        const inClause = buildInClause(
          'filter_mst.description',
          securityType
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         MODE OF ISSUE
      --------------------------------------------------------- */

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue
            AS filter_mmi
            ON filter_mmi.code =
               mi.mode_issue
        `);

        const inClause = buildInClause(
          'filter_mmi.description',
          modeOfIssue
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      /* ---------------------------------------------------------
         ISIN
      --------------------------------------------------------- */

      if (hasFilterValue(isin)) {
        const inClause = buildInClause(
          'mi.isin',
          isin,
          true
        );

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return {
        joins,
        conditions,
        params
      };
    };

    /* =========================================================
       BUILD FILTERS
    ========================================================= */

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0
        ? filterJoins.join('\n')
        : '';

    const filterSql =
      filterConditions.length > 0
        ? ` AND ${filterConditions.join(' AND ')}`
        : '';

    console.log('cyStart:', cyStart);
    console.log('cyEnd:', cyEnd);
    console.log('filterJoins:', filterJoins);
    console.log('filterConditions:', filterConditions);
    console.log('filterParams:', filterParams);

    /* =========================================================
       TRUSTEE BASE JOIN
       
       The main trustee table always needs issuer_trustee
       and master_trustee because the result itself is grouped
       by trustee.
       
       The additional filter JOINs above are only added when
       their corresponding filter is present.
    ========================================================= */

    /* =========================================================
       TOTALS
    ========================================================= */

    const totalIssueSizeRaw =
      await prisma.$queryRawUnsafe(`
        SELECT
          COALESCE(
            SUM(mi.issue_size),
            0
          ) AS aggregate

        FROM isin_re_issuance mi

        JOIN issuer_trustee it
          ON it.issuer_id =
             mi.isin_id

        ${filterJoinsSql}

        WHERE
          mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
      `,
        cyStart,
        cyEnd,
        ...filterParams
      );

    const totalIssueSizePrevYearRaw =
      await prisma.$queryRawUnsafe(`
        SELECT
          COALESCE(
            SUM(mi.issue_size),
            0
          ) AS aggregate

        FROM isin_re_issuance mi

        JOIN issuer_trustee it
          ON it.issuer_id =
             mi.isin_id

        ${filterJoinsSql}

        WHERE
          mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
      `,
        pyStart,
        pyEnd,
        ...filterParams
      );

    const totalIssuesCountCurrYearRaw =
      await prisma.$queryRawUnsafe(`
        SELECT
          COUNT(
            DISTINCT
            it.trustee_id,
            mi.allotment_date,
            mi.issuer_master_id
          ) AS aggregate

        FROM isin_re_issuance mi

        JOIN issuer_trustee it
          ON it.issuer_id =
             mi.isin_id

        ${filterJoinsSql}

        WHERE
          mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
      `,
        cyStart,
        cyEnd,
        ...filterParams
      );

    const totalIssuesCountPrevYearRaw =
      await prisma.$queryRawUnsafe(`
        SELECT
          COUNT(
            DISTINCT
            it.trustee_id,
            mi.allotment_date,
            mi.issuer_master_id
          ) AS aggregate

        FROM isin_re_issuance mi

        JOIN issuer_trustee it
          ON it.issuer_id =
             mi.isin_id

        ${filterJoinsSql}

        WHERE
          mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
      `,
        pyStart,
        pyEnd,
        ...filterParams
      );

    /* =========================================================
       TOTAL VALUES
    ========================================================= */

    const totalIssueSize =
      parseFloat(
        totalIssueSizeRaw[0]?.aggregate
      ) || 0;

    const totalIssueSizePrevYear =
      parseFloat(
        totalIssueSizePrevYearRaw[0]?.aggregate
      ) || 0;

    const totalIssuesCountCurrYear =
      parseInt(
        totalIssuesCountCurrYearRaw[0]?.aggregate,
        10
      ) || 0;

    const totalIssuesCountPrevYear =
      parseInt(
        totalIssuesCountPrevYearRaw[0]?.aggregate,
        10
      ) || 0;

    /* =========================================================
       SAFE DENOMINATORS
    ========================================================= */

    const safeTotalIssueSize =
      totalIssueSize > 0
        ? totalIssueSize / 10000000
        : 1;

    const safeTotalIssueSizePrevYear =
      totalIssueSizePrevYear > 0
        ? totalIssueSizePrevYear / 10000000
        : 1;

    const safeTotalIssuesCount =
      totalIssuesCountCurrYear > 0
        ? totalIssuesCountCurrYear
        : 1;

    const safeTotalIssuesCountPrevYear =
      totalIssuesCountPrevYear > 0
        ? totalIssuesCountPrevYear
        : 1;

    /* =========================================================
       MAIN TABLE
    ========================================================= */

    const limitOffsetSql =
      parsedLimit !== null
        ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}`
        : '';

    let tableQuery = '';

    /* =========================================================
       COUNT MODE
    ========================================================= */

    if (issueType === 'count') {
      tableQuery = `
        SELECT
          t1.id,
          t1.trustee_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (
              t1.no_issues /
              ${safeTotalIssuesCount}
            ) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (
              t2.no_issues /
              ${safeTotalIssuesCountPrevYear}
            ) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN IFNULL(t2.no_issues, 0) = 0 THEN
              CASE
                WHEN IFNULL(t1.no_issues, 0) = 0
                THEN 0
                ELSE 100
              END

            ELSE ROUND(
              (
                (
                  IFNULL(t1.no_issues, 0) -
                  IFNULL(t2.no_issues, 0)
                )
                /
                IFNULL(t2.no_issues, 0)
              ) * 100,
              2
            )
          END AS yoy

        FROM (

          SELECT
            mt.id,
            mt.short_name AS trustee_name,

            COUNT(
              DISTINCT
              it.trustee_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

          ORDER BY arr_rank

          ${limitOffsetSql}

        ) t1

        LEFT JOIN (

          SELECT
            mt.id,

            COUNT(
              DISTINCT
              it.trustee_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;
    }

    /* =========================================================
       SIZE MODE
    ========================================================= */

    else {
      tableQuery = `
        SELECT
          t1.id,
          t1.trustee_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (
              t1.issue_size /
              ${safeTotalIssueSize}
            ) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (
              t2.issue_size /
              ${safeTotalIssueSizePrevYear}
            ) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN IFNULL(t2.issue_size, 0) = 0 THEN
              CASE
                WHEN IFNULL(t1.issue_size, 0) = 0
                THEN 0
                ELSE 100
              END

            ELSE ROUND(
              (
                (
                  IFNULL(t1.issue_size, 0) -
                  IFNULL(t2.issue_size, 0)
                )
                /
                IFNULL(t2.issue_size, 0)
              ) * 100,
              2
            )
          END AS yoy

        FROM (

          SELECT
            mt.id,
            mt.short_name AS trustee_name,

            COUNT(
              DISTINCT
              it.trustee_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

          ORDER BY arr_rank

          ${limitOffsetSql}

        ) t1

        LEFT JOIN (

          SELECT
            mt.id,

            COUNT(
              DISTINCT
              it.trustee_id,
              mi.allotment_date,
              mi.issuer_master_id
            ) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;
    }

    /* =========================================================
       EXECUTE MAIN TABLE QUERY
    ========================================================= */

    const tableResult =
      await prisma.$queryRawUnsafe(
        tableQuery,

        // Current year
        cyStart,
        cyEnd,
        ...filterParams,

        // Previous year
        pyStart,
        pyEnd,
        ...filterParams
      );

    /* =========================================================
       TOTAL COUNT FOR PAGINATION
    ========================================================= */

    const totalCountResult =
      await prisma.$queryRawUnsafe(`
        SELECT
          COUNT(
            DISTINCT
            it.trustee_id,
            mi.allotment_date,
            mi.issuer_master_id
          ) AS total

        FROM isin_re_issuance mi

        JOIN issuer_trustee it
          ON it.issuer_id =
             mi.isin_id

        JOIN master_trustee mt
          ON mt.id =
             it.trustee_id

        ${filterJoinsSql}

        WHERE
          mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
      `,
        cyStart,
        cyEnd,
        ...filterParams
      );

    const totalRecords =
      parseInt(
        totalCountResult[0]?.total,
        10
      ) || 0;

    /* =========================================================
       SECTOR BREAKUP
    ========================================================= */

    const sectorValueSelect =
      issueType === 'count'
        ? `
          COUNT(
            DISTINCT
            it.trustee_id,
            mi.allotment_date,
            mi.issuer_master_id
          )
        `
        : `
          ROUND(
            SUM(mi.issue_size) / 10000000,
            2
          )
        `;

    /* =========================================================
       RANKED TRUSTEES FOR SECTOR
    ========================================================= */

    const rankedTrusteesSubQuery =
      issueType === 'count'
        ? `
          SELECT
            mt.id AS trustee_id,
            mt.short_name AS trustee_name,

            RANK() OVER (
              ORDER BY
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC,
                SUM(mi.issue_size) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

          LIMIT 10
        `
        : `
          SELECT
            mt.id AS trustee_id,
            mt.short_name AS trustee_name,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(
                  DISTINCT
                  it.trustee_id,
                  mi.allotment_date,
                  mi.issuer_master_id
                ) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_trustee it
            ON it.issuer_id =
               mi.isin_id

          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id

          ${filterJoinsSql}

          WHERE
            mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY
            it.trustee_id,
            mt.id,
            mt.short_name

          LIMIT 10
        `;

    /* =========================================================
       SECTOR QUERY
    ========================================================= */

    const sectorQuery = `
      SELECT
        r.trustee_id AS id,
        r.trustee_name AS name,
        r.arr_rank,

        mbs.code,
        mbs.description,

        ${sectorValueSelect} AS value

      FROM (
        ${rankedTrusteesSubQuery}
      ) r

      JOIN issuer_trustee it
        ON it.trustee_id =
           r.trustee_id

      JOIN isin_re_issuance mi
        ON mi.isin_id =
           it.issuer_id

      JOIN master_business_sector mbs
        ON mi.business_sector =
           mbs.code

      ${filterJoinsSql}

      WHERE
        mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}

      GROUP BY
        r.trustee_id,
        r.trustee_name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        mi.business_sector

      ORDER BY
        r.arr_rank,
        value DESC;
    `;

    const sectorData =
      await prisma.$queryRawUnsafe(
        sectorQuery,

        // Ranked trustees subquery
        cyStart,
        cyEnd,
        ...filterParams,

        // Outer sector query
        cyStart,
        cyEnd,
        ...filterParams
      );

    /* =========================================================
       RESPONSE FORMAT
    ========================================================= */

    const finalResult =
      tableResult.map((item) => ({
        id: item.id ?? '-',

        rank:
          item.cy_arr_rank ?? '-',

        name:
          item.trustee_name ?? '-',

        currentSize:
          item.cy_issue_size ?? '-',

        currentDeals:
          item.cy_issues ?? '-',

        currentMarketShare:
          item.cy_mkt_share ?? '-',

        previousRank:
          item.py_arr_rank ?? '-',

        previousSize:
          item.py_issue_size ?? '-',

        previousDeals:
          item.py_issues ?? '-',

        previousMarketShare:
          item.py_mkt_share ?? '-',

        yoyChange:
          item.yoy ?? '-'
      }));

    /* =========================================================
       TOTALS
    ========================================================= */

    const totals = {
      currentSize:
        Number(safeTotalIssueSize) || 0,

      previousSize:
        Number(safeTotalIssueSizePrevYear) || 0,

      currentDeals:
        Number(safeTotalIssuesCount) || 0,

      previousDeals:
        Number(safeTotalIssuesCountPrevYear) || 0
    };

    /* =========================================================
       RESPONSE
    ========================================================= */

    res.status(200).json({
      tableData: finalResult,

      sectorData,

      totals,

      pagination: {
        total: totalRecords,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error(
      'Trustees data API error:',
      error
    );

    res.status(500).json({
      error: 'Failed to fetch trustees data',
      message: error.message
    });
  }
});


app.post('/trustees_page_credit_rating_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      rating = "",
      registrar = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      trustee = "",
      nature = "",
      ownershipType = "",
      creditRatingAgency = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    /* ---------------- HELPER: Build multi-value IN / LIKE clause ---------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------- DYNAMIC FILTER BUILDER ----------------
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    ---------------------------------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* RATING */
      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = i.isin_id
        `);
        const c = buildInClause('filter_mir.rating', rating);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* CREDIT RATING AGENCY */
      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);
        const c = buildInClause('filter_ma_agency.short_name', creditRatingAgency);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* REGISTRAR */
      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);
        const c = buildInClause('filter_mr.registrar_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SENIORITY */
      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = i.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* TAX FREE */
      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = i.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURED FLAG */
      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = i.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECTOR */
      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = i.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* TRUSTEE */
      if (hasFilterValue(trustee)) {
        addJoin(`
          LEFT JOIN issuer_trustee AS filter_it
            ON filter_it.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_trustee AS filter_mt
            ON filter_mt.id = filter_it.trustee_id
        `);
        const c = buildInClause('filter_mt.short_name', trustee, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* NATURE (nature_type lives on master_issuer) */
      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mitn.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* OWNERSHIP TYPE (issuer_ownership_type lives on master_issuer) */
      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* DEAL SIZE */
      if (hasFilterValue(dealSize)) {
        const c = buildInClause('i.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* LISTING STATUS */
      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange AS filter_mise
            ON filter_mise.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_listing_status AS filter_mls
            ON filter_mls.code = filter_mise.listing_status
        `);
        const c = buildInClause('filter_mls.description', listingStatus);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURITY TYPE */
      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = i.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* MODE OF ISSUE */
      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = i.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISIN */
      if (hasFilterValue(isin)) {
        const c = buildInClause('i.isin', isin, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0 ? filterJoins.join('\n') : '';

    const filterSql =
      filterConditions.length > 0
        ? ' AND ' + filterConditions.join(' AND ')
        : '';

    /* ---------------- FILTERED TOTALS (percentage denominator) ---------------- */

    const totalRatingNoResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      JOIN isin_re_issuance i
        ON i.isin_id = master_issuer_rating.issuer_id
      JOIN master_agency
        ON master_agency.id = master_issuer_rating.agency_id
      JOIN issuer_trustee
        ON issuer_trustee.issuer_id = i.isin_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalRatingNo = Number(totalRatingNoResult[0]?.aggregate) || 0;
    const safeTotalRatingNo = totalRatingNo > 0 ? totalRatingNo : 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const creditRatingQuery = `
      SELECT
        MAX(master_agency.short_name) AS label,
        ROUND(
          (COUNT(master_issuer_rating.id) / ${safeTotalRatingNo}) * 100,
          2
        ) AS percentage,
        COUNT(master_issuer_rating.id) AS rating_no,
        CONCAT(
          '#',
          SUBSTRING(
            LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'),
            -6
          )
        ) AS color,
        MAX(master_issuer_rating.rating) AS rating
      FROM master_agency
      INNER JOIN master_issuer_rating
        ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN isin_re_issuance AS i
        ON i.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_trustee
        ON issuer_trustee.issuer_id = i.isin_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
      ${filterSql}
      GROUP BY
        master_issuer_rating.rating
    `;

    const creditRatingResult = await prisma.$queryRawUnsafe(
      creditRatingQuery,
      cyStart,
      cyEnd,
      ...filterParams
    );

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.label || '-',
        percentage: totalRatingNo === 0 ? 0 : (Number(item?.percentage) || 0),
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.rating || '-'
      };
    });

    res.status(200).json(finalResult);

  } catch (error) {
    console.error('Trustees credit rating API error:', error);
    res.status(500).json({
      error: 'Failed to fetch trustees credit rating data',
      message: error.message
    });
  }
});

app.post('/trusteePage_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31',
      limit = 25,
      offset = 0,
      search = ""
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const rating = toArray(req.body.rating);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const trustee = toArray(req.body.trustee);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const listingStatus = toArray(req.body.listingStatus);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);

    // ── Single-select filters (strings) ──
    const registrar = req.body.registrar || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // ─────────────────────
    // Dynamic WHERE conditions
    // ─────────────────────
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    // Ensure the ISIN has at least one trustee
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM issuer_trustee it
        WHERE it.issuer_id = mi.isin_id
      )
    `);

    // Combined search for issuerName and isin (single-select LIKE)
    if (search && search.trim() !== '') {
      conditions.push(`(
        id.issuer_name LIKE ? 
        OR mi.isin LIKE ?
      )`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }

    // Rating (multi-select)
    if (hasFilterValue(rating)) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select)
    if (hasFilterValue(listingStatus)) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2 
        LEFT JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status 
        WHERE mise2.issuer_id = mi.isin_id AND mls2.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (hasFilterValue(seniority)) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (hasFilterValue(securedFlag)) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (hasFilterValue(sector)) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Trustee (multi-select)
    if (hasFilterValue(trustee)) {
      const placeholders = trustee.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2 
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id 
        WHERE it2.issuer_id = mi.isin_id AND mt2.short_name IN (${placeholders})
      )`);
      params.push(...trustee);
    }

    // Nature (multi-select)
    if (hasFilterValue(nature)) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (hasFilterValue(ownershipType)) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select)
    if (hasFilterValue(creditRatingAgency)) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency ma2 ON ma2.id = mir2.agency_id 
        WHERE mir2.issuer_id = mi.isin_id AND ma2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select)
    if (hasFilterValue(securityType)) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (hasFilterValue(modeOfIssue)) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Registrar (single-select, LIKE filter)
    if (hasFilterValue(registrar)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir2 
        JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id 
        WHERE ir2.issuer_id = mi.isin_id AND mr2.registrar_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ─────────────────────
    // Main data query — derived tables for 1:N relations
    // ─────────────────────
    const dataQuery = `
      SELECT
        mi.isin_id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,

        id.issuer_name AS issuer_name,
        miot.description AS ownership_type,
        mint.description AS nature,
        mbs.description AS sector,
        mst.description AS security_type,
        mmi.description AS mode_of_issue,
        mstc.description AS Seniority,
        msf.description AS secured_flag,

        -- 1:N relations pre-aggregated in derived tables
        t.debenture_trustee,
        a.Arranger,
        r.Registrar,
        cr.credit_rating_info,
        crf.credit_rating,
        crf.credit_rating_agency,
        ls.listing_status,
        ls.listing_status_code,
        cp.coupon_rate

      FROM isin_re_issuance mi

      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id

      LEFT JOIN master_issuer m
        ON m.id = mi.isin_id

      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = m.nature_type

      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector

      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue

      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority

      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag

      -- 1. Trustees
      LEFT JOIN (
        SELECT it.issuer_id,
               GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ') AS debenture_trustee
        FROM issuer_trustee it
        JOIN master_trustee mt ON mt.id = it.trustee_id
        GROUP BY it.issuer_id
      ) t ON t.issuer_id = mi.isin_id

      -- 2. Arrangers
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ') AS Arranger
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) a ON a.issuer_id = mi.isin_id

      -- 3. Registrars
      LEFT JOIN (
        SELECT ir.issuer_id,
               GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ') AS Registrar
        FROM issuer_registrar ir
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        GROUP BY ir.issuer_id
      ) r ON r.issuer_id = mi.isin_id

      -- 4. Full credit rating info (agency: rating)
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT CONCAT(ma.short_name, ': ', mir.rating) SEPARATOR '; ') AS credit_rating_info
        FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = mi.isin_id

      -- 5. First credit rating (by agency id) + its agency
      LEFT JOIN (
        SELECT issuer_id,
               rating AS credit_rating,
               agency_short_name AS credit_rating_agency
        FROM (
          SELECT mir.issuer_id,
                 mir.rating,
                 ma.short_name AS agency_short_name,
                 ROW_NUMBER() OVER (PARTITION BY mir.issuer_id ORDER BY ma.id) AS rn
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
        ) x
        WHERE x.rn = 1
      ) crf ON crf.issuer_id = mi.isin_id

      -- 6. First listing status (by exchange id)
      LEFT JOIN (
        SELECT issuer_id,
               listing_status AS listing_status_code,
               listing_status_description AS listing_status
        FROM (
          SELECT mise.issuer_id,
                 mise.listing_status,
                 mls.description AS listing_status_description,
                 ROW_NUMBER() OVER (PARTITION BY mise.issuer_id ORDER BY mise.id) AS rn
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = mi.isin_id

      -- 7. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = mi.isin_id

      ${whereClause}

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ─────────────────────
    // Count query — unchanged (already fast)
    // ─────────────────────
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi

      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id

      LEFT JOIN master_issuer m
        ON m.id = mi.isin_id

      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = m.nature_type

      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector

      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue

      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority

      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag

      ${whereClause}
    `;

    // ─────────────────────
    // Execute queries
    // ─────────────────────
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // ─────────────────────
    // Final formatting
    // ─────────────────────
    const finalResult = result?.map((item) => {
      const allotment = item?.allotment_date
        ? new Date(item?.allotment_date).toISOString().split('T')[0]
        : null;

      const maturity = item?.maturity_date
        ? new Date(item?.maturity_date).toISOString().split('T')[0]
        : null;

      return {
        id: item?.isin_id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate ?? '-',
        creditRatingAgency: item?.credit_rating_agency || '-',
        creditRating: item?.credit_rating || '-',
        debentureTrustee: item?.debenture_trustee || '-',
        registrar: item?.Registrar || '-',
        arranger: item?.Arranger || '-',
        seniority: item?.Seniority || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        nature: item?.nature || '-',
        ownershipType: item?.ownership_type || '-',
        sector: item?.sector || '-',
      };
    });

    // ─────────────────────
    // Response
    // ─────────────────────
    res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('Error in trusteePage_detailed_data:', error);
    res.status(500).json({
      error: 'Failed to fetch detailed trusteepage data',
      message: error.message
    });
  }
});

app.post('/trustee_page_monthly_summary_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31'
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const ownershipType = toArray(req.body.ownershipType);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const securityType = toArray(req.body.securityType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const seniority = toArray(req.body.seniority);
    const taxFree = toArray(req.body.taxFree);
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    // ── Single-select filters (strings) ──
    const dealSize = req.body.dealSize || "";
    const trustee = req.body.trustee || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ─── Generate expected month list (chronological, includes empty months) ───
    const expectedMonths = getMonthsInRange(currentStartDate, currentEndDate);

    /* ---------------------------------
       HELPER: Build multi-value IN / LIKE clause
    --------------------------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------------------------
       DYNAMIC FILTER BUILDER
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    --------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* ── Base date / visibility ── */
      conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
      params.push(cyStart, cyEnd);
      conditions.push(`mi.is_visible = 1`);

      /* ── 1:N relationship filters (EXISTS = no row multiplication, no joins) ── */

      if (hasFilterValue(rating)) {
        const c = buildInClause('mir.rating', rating);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(creditRatingAgency)) {
        const c = buildInClause('ma.short_name', creditRatingAgency);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(listingStatus)) {
        const c = buildInClause('mls.description', listingStatus);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise
            JOIN master_listing_status mls ON mls.code = mise.listing_status
            WHERE mise.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      /* ── Direct conditions (no join needed) ── */

      if (hasFilterValue(dealSize)) {
        const c = buildInClause('mi.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ── 1:1 lookup filters (dynamic JOINs, added only when needed) ── */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mint
            ON filter_mint.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mint.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = mi.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(trustee)) {
        // mt is already INNER JOINed in the base FROM; use its alias directly.
        const c = buildInClause('mt.short_name', trustee, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql = filterJoins.length > 0 ? filterJoins.join('\n') : '';
    const whereClause = filterConditions.length
      ? `WHERE ${filterConditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - Base joins: issuer_trustee (needed for grouping) + master_trustee
         (needed for trustee filter and label)
       - 1:N filters (rating, agency, listing status) handled via EXISTS
       - Only filters with values contribute their JOINs
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.id, '-', it.trustee_id)) AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                            AS issue_size,
        SUM(mi.issue_size)           AS actual_issue_size
      FROM isin_re_issuance mi
      INNER JOIN issuer_trustee it
        ON it.issuer_id = mi.isin_id
      INNER JOIN master_trustee mt
        ON mt.id = it.trustee_id
      ${filterJoinsSql}
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...filterParams);

    // ─── Merge SQL results with expected month list (includes empty months) ───
    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,
        noOfIssue: data ? Number(data.no_of_issue ?? 0) : 0,
        issueSize: data ? Number(data.issue_size ?? 0) : 0,
        actualIssueSize: data ? Number(data.actual_issue_size ?? 0) : 0
      };
    });

    res.status(200).json({
      success: true,
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Error in trustee_page_monthly_summary_data:', error);
    res.status(500).json({
      error: 'Failed to fetch trustee monthly summary data',
      message: error.message
    });
  }
});

app.post('/trustee_page_monthly_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2026-04-01',
      endDate = '2026-05-28',
      month = "",
      limit = 25,
      offset = 0,
      trusteeName = [],
      issuerName = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      creditRatingAgency = [],
      listingStatus = [],
      securityType = [],
      modeOfIssue = [],
      arranger = [],
      registrar = [],
      isin = []
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    const safeMonth = month !== "" ? parseInt(month, 10) : null;
    if (safeMonth !== null && (isNaN(safeMonth) || safeMonth < 1 || safeMonth > 12)) {
      return res.status(400).json({
        success: false,
        error: 'month must be between 1 and 12'
      });
    }

    // =========================
    // HELPER: Build multi-value IN clause
    // =========================
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================
    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Trustee Name filter
    if (hasFilterValue(trusteeName)) {
      const trusteeValue = Array.isArray(trusteeName) ? trusteeName : [trusteeName];
      const inClause = buildInClause('mt2.short_name', trusteeValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Issuer Name filter
    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName) ? issuerName : [issuerName];
      const inClause = buildInClause('id2.issuer_name', issuerNameValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_details id2
          WHERE id2.id = i.issuer_master_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // ISIN filter
    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating) ? rating : [rating];
      const inClause = buildInClause('mir2.rating', ratingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Seniority filter
    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority) ? seniority : [seniority];
      const inClause = buildInClause('mstc2.description', seniorityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_seniority_tier_classification mstc2
          WHERE mstc2.code = i.seniority AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Tax Free filter
    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree) ? taxFree : [taxFree];
      const inClause = buildInClause('mtf2.description', taxFreeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_tax_free mtf2
          WHERE mtf2.code = i.tax_free AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Secured Flag filter
    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag) ? securedFlag : [securedFlag];
      const inClause = buildInClause('msf2.description', securedFlagValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_secured_flag msf2
          WHERE msf2.code = i.secured_flag AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Credit Rating Agency filter
    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency) ? creditRatingAgency : [creditRatingAgency];
      const inClause = buildInClause('mag2.short_name', agencyValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Listing Status filter
    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus) ? listingStatus : [listingStatus];
      const inClause = buildInClause('mls2.description', listingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Security Type filter
    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType) ? securityType : [securityType];
      const inClause = buildInClause('mst2.description', securityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_security_type mst2
          WHERE mst2.code = i.security_class AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Mode of Issue filter
    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue) ? modeOfIssue : [modeOfIssue];
      const inClause = buildInClause('mmi2.description', modeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_mode_issue mmi2
          WHERE mmi2.code = i.mode_issue AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Arranger filter
    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger) ? arranger : [arranger];
      const inClause = buildInClause('ma2.short_name', arrangerValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_arranger ia2
          JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
          WHERE ia2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Registrar filter
    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar) ? registrar : [registrar];
      const inClause = buildInClause('mr2.short_name', registrarValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir2
          JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
          WHERE ir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // =========================
    // FINAL WHERE CLAUSE
    // =========================
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY — derived tables for 1:N relations
    // =========================
    const dataQuery = `
      SELECT
        i.id                              AS issuerId,
        i.isin                            AS isin,
        i.allotment_date                  AS allotment_date,
        i.maturity_date                   AS maturity_date,
        i.security_name                   AS security_name,
        i.issue_size                      AS issue_size,
        i.face_value                      AS face_value,
        i.issuer_master_id                AS issuer_master_id,

        id.issuer_name                    AS issuer_name,
        s.description                     AS security_type,
        mi.description                    AS mode_issue,
        mstc.description                  AS seniority,
        tf.description                    AS tax_free,
        msf.description                   AS secured_flag,

        it.trustee_id                     AS trustee_id,
        mt.short_name                     AS debenture_trustee_name,

        -- pre-aggregated 1:N relations
        cp.coupon_rate,
        r.registrar_detail,
        cr.rating,
        cr.agency_name,
        cr.rating_info,
        ar.arranger_name,
        ls.listing_status

      FROM isin_re_issuance i

      -- trustee-centric axis (intentional row per (issuer, trustee))
      INNER JOIN issuer_trustee  it ON i.isin_id = it.issuer_id
      INNER JOIN master_trustee  mt ON mt.id = it.trustee_id

      LEFT JOIN issuer_details    id   ON id.id = i.issuer_master_id
      LEFT JOIN master_security_type  s   ON s.code = i.security_class
      LEFT JOIN master_mode_issue     mi  ON mi.code = i.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free       tf  ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag   msf ON msf.code = i.secured_flag

      -- 1. First coupon rate (safe ORDER BY — no id column)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (
                   PARTITION BY icd.issuer_id
                   ORDER BY icd.coupon_rate ASC
                 ) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = i.isin_id

      -- 2. Registrars (all, comma-separated)
      LEFT JOIN (
        SELECT ir.issuer_id,
               GROUP_CONCAT(DISTINCT mr.short_name ORDER BY mr.short_name ASC SEPARATOR ', ') AS registrar_detail
        FROM issuer_registrar ir
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        GROUP BY ir.issuer_id
      ) r ON r.issuer_id = i.isin_id

      -- 3. Ratings + agencies (all)
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT mir.rating    ORDER BY mir.rating    ASC SEPARATOR ', ') AS rating,
               GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS agency_name,
               GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ')   AS rating_info
        FROM master_issuer_rating mir
        JOIN master_agency mag ON mag.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = i.isin_id

      -- 4. Arrangers (all, comma-separated)
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') AS arranger_name
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) ar ON ar.issuer_id = i.isin_id

      -- 5. First listing status (safe ORDER BY — no mise.id)
      LEFT JOIN (
        SELECT issuer_id, listing_status
        FROM (
          SELECT mise.issuer_id,
                 mls.description AS listing_status,
                 ROW_NUMBER() OVER (
                   PARTITION BY mise.issuer_id
                   ORDER BY mise.listing_status ASC, mise.issuer_id ASC
                 ) AS rn
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = i.isin_id

      ${whereClause}

      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — trustee-centric count
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id, it.trustee_id
        FROM isin_re_issuance i
        INNER JOIN issuer_trustee it ON i.isin_id = it.issuer_id
        INNER JOIN master_trustee mt ON mt.id = it.trustee_id
        LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
        LEFT JOIN master_security_type s ON s.code = i.security_class
        LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
        LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.id, it.trustee_id, mt.short_name, i.isin
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // =========================
    // FORMAT RESPONSE
    // =========================
    const finalResult = result?.map((item) => {
      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date).toISOString().split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date).toISOString().split('T')[0]
        : '-';

      return {
        issuerId: item?.issuerId || '-',
        trusteeId: item?.trustee_id || '-',
        debentureTrustee: item?.debenture_trustee_name || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || '-',
        allotmentDate,
        maturityDate,
        couponRate: item?.coupon_rate || '-',
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        rating: item?.rating || '-',
        creditRatingAgency: item?.agency_name || '-',
        arranger: item?.arranger_name || '-',
        registrar: item?.registrar_detail || '-',
        seniority: item?.seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        issuerMasterId: item?.issuer_master_id || '-'
      };
    });

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('trustee_page monthly_detailed_data Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch trustee monthly detailed data',
      message: error.message
    });
  }
});

app.post('/trustee_top_participants_details', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      trusteeId,
      SearchQuery = "",
      limit = 25,
      offset = 0,
      sortField = 'issuer_name',
      sortOrder = 'ASC',

      // ── Filters ──
      ownershipType = [],
      nature = [],
      sector = [],
      securityType = [],
      modeOfIssue = [],
      creditRatingAgency = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      listingStatus = [],
      registrar = [],
      arranger = [],
      isin = [],
      issuerName = [],
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================

    if (!startDate || !endDate || !trusteeId) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and trusteeId are required',
      });
    }

    const parsedTrusteeId = parseInt(trusteeId, 10);

    if (isNaN(parsedTrusteeId) || parsedTrusteeId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'trusteeId must be a positive integer',
      });
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        message: 'limit must be a non-negative integer',
      });
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'offset must be a non-negative integer',
      });
    }

    // =========================
    // VALIDATE AND FORMAT DATES
    // =========================

    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return null;
      }

      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }

      return date
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    // =========================
    // SORT CONFIGURATION
    // =========================

    const validSortFields = [
      'issuer_name',
      'allotment_date',
      'maturity_date',
      'issue_size',
      'coupon_rate',
      'security_name',
    ];

    const orderBy = validSortFields.includes(sortField)
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // =========================
    // SEARCH CONFIGURATION
    // =========================

    const searchTerm = SearchQuery?.trim() || '';

    const searchPattern = searchTerm
      ? `%${searchTerm}%`
      : null;

    // =========================
    // HELPER: BUILD MULTI-VALUE IN CLAUSE
    // =========================

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) && values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params,
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals,
      };
    };

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================

    const conditions = [];
    const params = [];

    // ── Required: trustee + date range + visibility ──

    conditions.push(`it.trustee_id = ?`);
    params.push(parsedTrusteeId);

    conditions.push(
      `i.allotment_date BETWEEN ? AND ?`
    );

    params.push(
      sqlStartDate,
      sqlEndDate
    );

    conditions.push(`i.is_visible = 1`);

    // =========================
    // OWNERSHIP TYPE FILTER
    // =========================

    if (hasFilterValue(ownershipType)) {
      const ownershipValue = Array.isArray(ownershipType)
        ? ownershipType
        : [ownershipType];

      const inClause = buildInClause(
        'miot2.description',
        ownershipValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2
              ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // NATURE FILTER
    // =========================

    if (hasFilterValue(nature)) {
      const natureValue = Array.isArray(nature)
        ? nature
        : [nature];

      const inClause = buildInClause(
        'mitn2.description',
        natureValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2
              ON mitn2.code = mi2.nature_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // SECTOR FILTER
    // =========================

    if (hasFilterValue(sector)) {
      const sectorValue = Array.isArray(sector)
        ? sector
        : [sector];

      const inClause = buildInClause(
        'mbs2.description',
        sectorValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_business_sector mbs2
            WHERE mbs2.code = i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // SECURITY TYPE FILTER
    // =========================

    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType)
        ? securityType
        : [securityType];

      const inClause = buildInClause(
        'mst2.description',
        securityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_security_type mst2
            WHERE mst2.code = i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // MODE OF ISSUE FILTER
    // =========================

    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue)
        ? modeOfIssue
        : [modeOfIssue];

      const inClause = buildInClause(
        'mmi2.description',
        modeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_mode_issue mmi2
            WHERE mmi2.code = i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // CREDIT RATING AGENCY FILTER
    // =========================

    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency)
        ? creditRatingAgency
        : [creditRatingAgency];

      const inClause = buildInClause(
        'mag2.short_name',
        agencyValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            JOIN master_agency mag2
              ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // RATING FILTER
    // =========================

    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating)
        ? rating
        : [rating];

      const inClause = buildInClause(
        'mir2.rating',
        ratingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // SENIORITY FILTER
    // =========================

    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority)
        ? seniority
        : [seniority];

      const inClause = buildInClause(
        'mstc2.description',
        seniorityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // TAX FREE FILTER
    // =========================

    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree)
        ? taxFree
        : [taxFree];

      const inClause = buildInClause(
        'mtf2.description',
        taxFreeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_tax_free mtf2
            WHERE mtf2.code = i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // SECURED FLAG FILTER
    // =========================

    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag)
        ? securedFlag
        : [securedFlag];

      const inClause = buildInClause(
        'msf2.description',
        securedFlagValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_secured_flag msf2
            WHERE msf2.code = i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // LISTING STATUS FILTER
    // =========================

    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus)
        ? listingStatus
        : [listingStatus];

      const inClause = buildInClause(
        'mls2.description',
        listingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2
              ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // REGISTRAR FILTER
    // =========================

    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar)
        ? registrar
        : [registrar];

      const inClause = buildInClause(
        'mr2.short_name',
        registrarValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_registrar ir2
            JOIN master_registrar mr2
              ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // ARRANGER FILTER
    // =========================

    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger)
        ? arranger
        : [arranger];

      const inClause = buildInClause(
        'ma2.short_name',
        arrangerValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_arranger ia2
            JOIN master_arranger ma2
              ON ma2.id = ia2.arranger_id
            WHERE ia2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================
    // ISIN FILTER
    // =========================

    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin)
        ? isin
        : [isin];

      const inClause = buildInClause(
        'i.isin',
        isinValue,
        true
      );

      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // =========================
    // ISSUER NAME FILTER
    // =========================

    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName)
        ? issuerName
        : [issuerName];

      const inClause = buildInClause(
        'id2.issuer_name',
        issuerNameValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_details id2
            WHERE id2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    const whereClause = conditions.join(' AND ');

    // =========================
    // BASE QUERY
    // =========================

    const baseQuery = `
      SELECT
        i.id,
        i.isin_id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        i.maturity_date,
        i.security_name,
        i.issue_size,
        i.face_value,
        i.issuer_master_id,

        (
          SELECT GROUP_CONCAT(
            DISTINCT icd.coupon_rate
            SEPARATOR ', '
          )
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = i.isin_id
        ) AS coupon_rate,

        mt.short_name AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mr.registrar_name
            SEPARATOR ', '
          )
          FROM issuer_registrar ir
          JOIN master_registrar mr
            ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = i.isin_id
        ) AS registrar_detail,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mir.rating
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          WHERE mir.issuer_id = i.isin_id
        ) AS rating,

        (
          SELECT GROUP_CONCAT(
            DISTINCT ma.short_name
            SEPARATOR ', '
          )
          FROM issuer_arranger ia
          JOIN master_arranger ma
            ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = i.isin_id
        ) AS arranger_name,

        s.description AS security_type,

        mi.description AS mode_issue,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mag.short_name
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          JOIN master_agency mag
            ON mag.id = mir.agency_id
          WHERE mir.issuer_id = i.isin_id
        ) AS agency_name,

        mstc.description AS seniority,

        tf.description AS tax_free,

        msf.description AS secured_flag,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM isin_re_issuance i

      INNER JOIN issuer_trustee it
        ON i.isin_id = it.issuer_id

      INNER JOIN master_trustee mt
        ON it.trustee_id = mt.id

      LEFT JOIN issuer_details id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue mi
        ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code = i.secured_flag

      WHERE ${whereClause}
    `;

    // =========================
    // SEARCH CONDITION
    // =========================

    const searchClause = `
      AND (
        issuer_name LIKE ?
        OR isin LIKE ?
        OR coupon_rate LIKE ?
        OR debenture_trustee_name LIKE ?
        OR registrar_detail LIKE ?
        OR rating LIKE ?
        OR arranger_name LIKE ?
        OR security_name LIKE ?
        OR security_type LIKE ?
        OR mode_issue LIKE ?
        OR CAST(issue_size AS CHAR) LIKE ?
        OR CAST(face_value AS CHAR) LIKE ?
        OR agency_name LIKE ?
        OR seniority LIKE ?
        OR tax_free LIKE ?
        OR secured_flag LIKE ?
        OR listing_status LIKE ?
      )
    `;

    const searchParams = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    ];

    // =========================
    // DATA QUERY
    // =========================

    let dataQuery = `
      SELECT *
      FROM (${baseQuery}) x
      WHERE 1=1
    `;

    const dataParams = [...params];

    if (searchPattern) {
      dataQuery += searchClause;
      dataParams.push(...searchParams);
    }

    dataQuery += `
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    dataParams.push(
      parsedLimit,
      parsedOffset
    );

    // =========================
    // TOTAL COUNT
    // =========================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
      WHERE 1=1
    `;

    const countParams = [...params];

    if (searchPattern) {
      countQuery += searchClause;
      countParams.push(...searchParams);
    }

    // =========================
    // CLUBBED COUNT

    let clubbedCountQuery = `
      SELECT COUNT(*) AS clubbedTotal
      FROM (
        SELECT
          issuer_name,
          DATE(allotment_date) AS allotment_date
        FROM (${baseQuery}) x
        WHERE 1=1
    `;

    const clubbedCountParams = [...params];

    if (searchPattern) {
      clubbedCountQuery += searchClause;
      clubbedCountParams.push(...searchParams);
    }

    clubbedCountQuery += `
        GROUP BY
          issuer_name,
          DATE(allotment_date)
      ) clubbed
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [
      data,
      totalCount,
      clubbedCount,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(
        dataQuery,
        ...dataParams
      ),

      prisma.$queryRawUnsafe(
        countQuery,
        ...countParams
      ),

      prisma.$queryRawUnsafe(
        clubbedCountQuery,
        ...clubbedCountParams
      ),
    ]);

    // =========================
    // RESPONSE
    // =========================

    return res.json({
      success: true,

      // Existing individual record count
      totalRecords: Number(
        totalCount?.[0]?.total || 0
      ),

      // New clubbed count
      clubbedTotalRecords: Number(
        clubbedCount?.[0]?.clubbedTotal || 0
      ),

      data,
    });

  } catch (error) {
    console.error(
      'trustee_issue_details error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});
//updated rating agency APIs DONE

app.post('/rating_agencies_page_top_agencies_data', async (req, res) => {
  try {
    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'string') return [value];
      return [];
    };

    const buildInClause = (field, values) => {
      if (!Array.isArray(values) || values.length === 0) {
        return null;
      }

      const placeholders = values.map(() => '?').join(', ');

      return {
        clause: `${field} IN (${placeholders})`,
        params: values
      };
    };

    // ─────────────────────────────────────────────────────────────
    // REQUEST BODY
    // ─────────────────────────────────────────────────────────────

    const {
      startDate,
      endDate,
      issueType,
      limit,
      offset = 0,
      isin = ''
    } = req.body;

    const rating = toArray(req.body.rating);
    const registrar = toArray(req.body.registrar);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const listingStatus = toArray(req.body.listingStatus);

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate, endDate are required'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // PAGINATION VALIDATION
    // ─────────────────────────────────────────────────────────────

    const parsedLimit = limit !== undefined && limit !== null && limit !== ''
      ? parseInt(limit, 10)
      : null;

    const parsedOffset = parseInt(offset, 10) || 0;

    if (
      parsedLimit !== null &&
      (Number.isNaN(parsedLimit) || parsedLimit < 0)
    ) {
      return res.status(400).json({
        error: 'limit must be a non-negative integer'
      });
    }

    if (
      Number.isNaN(parsedOffset) ||
      parsedOffset < 0
    ) {
      return res.status(400).json({
        error: 'offset must be a non-negative integer'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // DATE HANDLING
    // ─────────────────────────────────────────────────────────────

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (
      Number.isNaN(currentStartDate.getTime()) ||
      Number.isNaN(currentEndDate.getTime())
    ) {
      return res.status(400).json({
        error: 'Invalid date format'
      });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(
      previousStartDate.getFullYear() - 1
    );

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(
      previousEndDate.getFullYear() - 1
    );

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const sqlCurrentStart = formatDate(currentStartDate);
    const sqlCurrentEnd = formatDate(currentEndDate);
    const sqlPreviousStart = formatDate(previousStartDate);
    const sqlPreviousEnd = formatDate(previousEndDate);

    // ─────────────────────────────────────────────────────────────
    // DYNAMIC FILTER JOIN BUILDER
    // ─────────────────────────────────────────────────────────────

    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (joinSql) => {
        const normalizedJoin = joinSql.trim();

        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      const addCondition = (field, values) => {
        const inClause = buildInClause(field, values);

        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      };

      // ─────────────────────────────────────────────────────────
      // RATING
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = mi.isin_id
        `);

        addCondition('filter_mir.rating', rating);
      }

      // ─────────────────────────────────────────────────────────
      // REGISTRAR
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = mi.isin_id

          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);

        addCondition('filter_mr.registrar_name', registrar);
      }

      // ─────────────────────────────────────────────────────────
      // SENIORITY
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);

        addCondition('filter_mstc.description', seniority);
      }

      // ─────────────────────────────────────────────────────────
      // SECURED FLAG
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);

        addCondition('filter_msf.description', securedFlag);
      }

      // ─────────────────────────────────────────────────────────
      // SECTOR
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);

        addCondition('filter_mbs.description', sector);
      }

      // ─────────────────────────────────────────────────────────
      // NATURE
      // nature_type belongs to master_issuer
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id

          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);

        addCondition('filter_mitn.description', nature);
      }

      // ─────────────────────────────────────────────────────────
      // OWNERSHIP TYPE
      // issuer_ownership_type belongs to master_issuer
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id

          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code =
               filter_mi_ownership.issuer_ownership_type
        `);

        addCondition('filter_miot.description', ownershipType);
      }

      // ─────────────────────────────────────────────────────────
      // CREDIT RATING AGENCY
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = mi.isin_id

          LEFT JOIN master_agency AS filter_ma
            ON filter_ma.id = filter_mir_agency.agency_id
        `);

        addCondition('filter_ma.short_name', creditRatingAgency);
      }

      // ─────────────────────────────────────────────────────────
      // SECURITY TYPE
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);

        addCondition('filter_mst.description', securityType);
      }

      // ─────────────────────────────────────────────────────────
      // MODE OF ISSUE
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);

        addCondition('filter_mmi.description', modeOfIssue);
      }

      // ─────────────────────────────────────────────────────────
      // LISTING STATUS
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange AS filter_mise
            ON filter_mise.issuer_id = mi.isin_id

          LEFT JOIN master_listing_status AS filter_mls
            ON filter_mls.code = filter_mise.listing_status
        `);

        addCondition('filter_mls.description', listingStatus);
      }

      // ─────────────────────────────────────────────────────────
      // ISIN SEARCH
      // ─────────────────────────────────────────────────────────

      if (hasFilterValue(isin)) {
        conditions.push('mi.isin LIKE ?');
        params.push(`%${isin}%`);
      }

      return {
        joins,
        conditions,
        params
      };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0
        ? filterJoins.join('\n')
        : '';

    const filterSql =
      filterConditions.length > 0
        ? ` AND ${filterConditions.join(' AND ')}`
        : '';

    console.log('Rating agency filterJoins:', filterJoins);
    console.log('Rating agency filterConditions:', filterConditions);
    console.log('Rating agency filterParams:', filterParams);

    // ─────────────────────────────────────────────────────────────
    // TOTALS
    // ─────────────────────────────────────────────────────────────

    const totalIssueSizeResult = await prisma.$queryRawUnsafe(
      `
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi

      JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id

      JOIN master_agency ma
        ON ma.id = mir.agency_id

      ${filterJoinsSql}

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
      `,
      sqlCurrentStart,
      sqlCurrentEnd,
      ...filterParams
    );

    const totalIssueSizePrevYearResult = await prisma.$queryRawUnsafe(
      `
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi

      JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id

      JOIN master_agency ma
        ON ma.id = mir.agency_id

      ${filterJoinsSql}

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
      `,
      sqlPreviousStart,
      sqlPreviousEnd,
      ...filterParams
    );

    const totalIssuesCountCurrYearResult = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(DISTINCT mi.id) AS aggregate
      FROM isin_re_issuance mi

      JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id

      JOIN master_agency ma
        ON ma.id = mir.agency_id

      ${filterJoinsSql}

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
      `,
      sqlCurrentStart,
      sqlCurrentEnd,
      ...filterParams
    );

    const totalIssuesCountPrevYearResult = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(DISTINCT mi.id) AS aggregate
      FROM isin_re_issuance mi

      JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id

      JOIN master_agency ma
        ON ma.id = mir.agency_id

      ${filterJoinsSql}

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
      `,
      sqlPreviousStart,
      sqlPreviousEnd,
      ...filterParams
    );

    // ─────────────────────────────────────────────────────────────
    // TOTALS PARSING
    // ─────────────────────────────────────────────────────────────

    const totalIssueSize =
      parseFloat(totalIssueSizeResult[0]?.aggregate) || 0;

    const totalIssueSizePrevYear =
      parseFloat(totalIssueSizePrevYearResult[0]?.aggregate) || 0;

    const totalIssuesCountCurrYear =
      parseInt(totalIssuesCountCurrYearResult[0]?.aggregate, 10) || 0;

    const totalIssuesCountPrevYear =
      parseInt(totalIssuesCountPrevYearResult[0]?.aggregate, 10) || 0;

    const safeTotalIssueSize =
      totalIssueSize > 0
        ? totalIssueSize / 10000000
        : 1;

    const safeTotalIssueSizePrevYear =
      totalIssueSizePrevYear > 0
        ? totalIssueSizePrevYear / 10000000
        : 1;

    const safeTotalIssuesCount =
      totalIssuesCountCurrYear > 0
        ? totalIssuesCountCurrYear
        : 1;

    const safeTotalIssuesCountPrevYear =
      totalIssuesCountPrevYear > 0
        ? totalIssuesCountPrevYear
        : 1;

    // ─────────────────────────────────────────────────────────────
    // PAGINATION SQL
    // ─────────────────────────────────────────────────────────────

    const limitOffsetSql =
      parsedLimit !== null
        ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}`
        : '';

    // ─────────────────────────────────────────────────────────────
    // MAIN TABLE QUERY
    // ─────────────────────────────────────────────────────────────

    let tableQuery = '';

    if (issueType === 'count') {
      tableQuery = `
        SELECT
          t1.id,
          t1.agency_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (t1.no_issues / ${safeTotalIssuesCount}) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (t2.no_issues / ${safeTotalIssuesCountPrevYear}) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN IFNULL(t2.no_issues, 0) = 0 THEN
              CASE
                WHEN IFNULL(t1.no_issues, 0) = 0 THEN 0
                ELSE 100
              END
            ELSE ROUND(
              (
                (
                  IFNULL(t1.no_issues, 0) -
                  IFNULL(t2.no_issues, 0)
                ) / IFNULL(t2.no_issues, 0)
              ) * 100,
              2
            )
          END AS yoy

        FROM (
          SELECT
            ma.id,
            ma.short_name AS agency_name,

            COUNT(DISTINCT mi.id) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                COUNT(DISTINCT mi.id) DESC,
                ROUND(SUM(mi.issue_size) / 10000000, 2) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_details
            ON issuer_details.id = mi.issuer_master_id

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
          ORDER BY arr_rank
          ${limitOffsetSql}
        ) t1

        LEFT JOIN (
          SELECT
            ma.id,

            COUNT(DISTINCT mi.id) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                COUNT(DISTINCT mi.id) DESC,
                ROUND(SUM(mi.issue_size) / 10000000, 2) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN issuer_details
            ON issuer_details.id = mi.issuer_master_id

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;
    } else {
      tableQuery = `
        SELECT
          t1.id,
          t1.agency_name,

          t1.no_issues AS cy_issues,
          t1.issue_size AS cy_issue_size,
          t1.arr_rank AS cy_arr_rank,

          t2.no_issues AS py_issues,
          t2.issue_size AS py_issue_size,
          t2.arr_rank AS py_arr_rank,

          ROUND(
            (t1.issue_size / ${safeTotalIssueSize}) * 100,
            2
          ) AS cy_mkt_share,

          ROUND(
            (t2.issue_size / ${safeTotalIssueSizePrevYear}) * 100,
            2
          ) AS py_mkt_share,

          CASE
            WHEN IFNULL(t2.issue_size, 0) = 0 THEN
              CASE
                WHEN IFNULL(t1.issue_size, 0) = 0 THEN 0
                ELSE 100
              END
            ELSE ROUND(
              (
                (
                  IFNULL(t1.issue_size, 0) -
                  IFNULL(t2.issue_size, 0)
                ) / IFNULL(t2.issue_size, 0)
              ) * 100,
              2
            )
          END AS yoy

        FROM (
          SELECT
            ma.id,
            ma.short_name AS agency_name,

            COUNT(DISTINCT mi.id) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                ROUND(SUM(mi.issue_size) / 10000000, 2) DESC,
                COUNT(DISTINCT mi.id) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
          ORDER BY arr_rank
          ${limitOffsetSql}
        ) t1

        LEFT JOIN (
          SELECT
            ma.id,

            COUNT(DISTINCT mi.id) AS no_issues,

            ROUND(
              SUM(mi.issue_size) / 10000000,
              2
            ) AS issue_size,

            RANK() OVER (
              ORDER BY
                ROUND(SUM(mi.issue_size) / 10000000, 2) DESC,
                COUNT(DISTINCT mi.id) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
        ) t2
          ON t1.id = t2.id

        ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(
      tableQuery,

      sqlCurrentStart,
      sqlCurrentEnd,
      ...filterParams,

      sqlPreviousStart,
      sqlPreviousEnd,
      ...filterParams
    );

    // ─────────────────────────────────────────────────────────────
    // TOTAL COUNT
    // ─────────────────────────────────────────────────────────────

    const totalCountResult = await prisma.$queryRawUnsafe(
      `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi

      JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id

      JOIN master_agency ma
        ON ma.id = mir.agency_id

      ${filterJoinsSql}

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
      `,
      sqlCurrentStart,
      sqlCurrentEnd,
      ...filterParams
    );

    const totalRecords =
      Number(totalCountResult[0]?.total) || 0;

    // ─────────────────────────────────────────────────────────────
    // SECTOR BREAKUP
    // ─────────────────────────────────────────────────────────────

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(DISTINCT mi.id)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedAgenciesSubQuery =
      issueType === 'count'
        ? `
          SELECT
            ma.id AS agency_id,
            ma.short_name AS agency_name,

            RANK() OVER (
              ORDER BY
                COUNT(DISTINCT mi.id) DESC,
                SUM(mi.issue_size) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
          ORDER BY arr_rank
          LIMIT 10
        `
        : `
          SELECT
            ma.id AS agency_id,
            ma.short_name AS agency_name,

            RANK() OVER (
              ORDER BY
                SUM(mi.issue_size) DESC,
                COUNT(DISTINCT mi.id) DESC
            ) AS arr_rank

          FROM isin_re_issuance mi

          JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id

          JOIN master_agency ma
            ON ma.id = mir.agency_id

          ${filterJoinsSql}

          WHERE mi.allotment_date BETWEEN ? AND ?
            AND mi.is_visible = 1
            ${filterSql}

          GROUP BY ma.id, ma.short_name
          ORDER BY arr_rank
          LIMIT 10
        `;

    const sectorQuery = `
      SELECT
        r.agency_id AS id,
        r.agency_name AS name,
        r.arr_rank,

        mbs.code,
        mbs.description,

        ${sectorValueSelect} AS value

      FROM (${rankedAgenciesSubQuery}) r

      JOIN master_issuer_rating mir
        ON mir.agency_id = r.agency_id

      JOIN isin_re_issuance mi
        ON mi.isin_id = mir.issuer_id

      JOIN master_business_sector mbs
        ON mi.business_sector = mbs.code

      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1

      GROUP BY
        r.agency_id,
        r.agency_name,
        r.arr_rank,
        mbs.code,
        mbs.description

      ORDER BY
        r.arr_rank,
        value DESC;
    `;

    const sectorData = await prisma.$queryRawUnsafe(
      sectorQuery,

      sqlCurrentStart,
      sqlCurrentEnd,
      ...filterParams,

      sqlCurrentStart,
      sqlCurrentEnd
    );

    // ─────────────────────────────────────────────────────────────
    // RESPONSE FORMAT
    // ─────────────────────────────────────────────────────────────

    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.agency_name ?? '-',

      currentSize: item.cy_issue_size ?? '-',
      currentDeals: item.cy_issues ?? '-',
      currentMarketShare: item.cy_mkt_share ?? '-',

      previousRank: item.py_arr_rank ?? '-',
      previousSize: item.py_issue_size ?? '-',
      previousDeals: item.py_issues ?? '-',
      previousMarketShare: item.py_mkt_share ?? '-',

      yoyChange: item.yoy ?? '-'
    }));

    const totals = {
      currentSize: Number(safeTotalIssueSize) || 0,
      previousSize: Number(safeTotalIssueSizePrevYear) || 0,
      currentDeals: Number(safeTotalIssuesCount) || 0,
      previousDeals: Number(safeTotalIssuesCountPrevYear) || 0
    };

    return res.status(200).json({
      tableData: finalResult,
      sectorData,
      totals,
      pagination: {
        total: totalRecords,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });
  } catch (error) {
    console.error(
      'Rating agencies top data API error:',
      error
    );

    return res.status(500).json({
      error: 'Failed to fetch rating agencies data',
      message: error.message
    });
  }
});

app.post('/rating_agencies_page_credit_rating_data', async (req, res) => {
  try {
    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    const {
      startDate,
      endDate,
      id,
      isin = ""
    } = req.body;

    // ── Multi-select filters (arrays) ──
    const rating = toArray(req.body.rating);
    const registrar = toArray(req.body.registrar);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const listingStatus = toArray(req.body.listingStatus);

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate, endDate are required'
      });
    }

    // Validate and parse id
    const parsedId = parseInt(id, 10);
    const isIdValid = !isNaN(parsedId) && parsedId > 0;

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const sqlStartDate = formatDate(currentStartDate);
    const sqlEndDate = formatDate(currentEndDate);

    /* ---------------- HELPER: Build multi-value IN / LIKE clause ---------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------- DYNAMIC FILTER BUILDER ----------------
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    ---------------------------------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* RATING */
      if (hasFilterValue(rating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = i.isin_id
        `);
        const c = buildInClause('filter_mir.rating', rating);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* CREDIT RATING AGENCY */
      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);
        const c = buildInClause('filter_ma_agency.short_name', creditRatingAgency);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* REGISTRAR */
      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);
        const c = buildInClause('filter_mr.registrar_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SENIORITY */
      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = i.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURED FLAG */
      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = i.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECTOR */
      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = i.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* NATURE (nature_type lives on master_issuer) */
      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mitn.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* OWNERSHIP TYPE (issuer_ownership_type lives on master_issuer) */
      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* LISTING STATUS */
      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange AS filter_mise
            ON filter_mise.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_listing_status AS filter_mls
            ON filter_mls.code = filter_mise.listing_status
        `);
        const c = buildInClause('filter_mls.description', listingStatus);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURITY TYPE */
      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = i.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* MODE OF ISSUE */
      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = i.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISIN */
      if (hasFilterValue(isin)) {
        const c = buildInClause('i.isin', isin, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0 ? filterJoins.join('\n') : '';

    const filterSql =
      filterConditions.length > 0
        ? ' AND ' + filterConditions.join(' AND ')
        : '';

    /* ---------------- TOTALS (parameterized, scoped by id if provided) ---------------- */

    const idFilterSql = isIdValid ? ` AND master_agency.id = ?` : '';
    const idFilterParams = isIdValid ? [parsedId] : [];

    const totalRatingNoResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer_rating mir
      INNER JOIN isin_re_issuance i
        ON i.isin_id = mir.issuer_id
      LEFT JOIN master_agency
        ON master_agency.id = mir.agency_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
      ${filterSql}
      ${idFilterSql}
    `, sqlStartDate, sqlEndDate, ...filterParams, ...idFilterParams);

    const totalRatingNo = Number(totalRatingNoResult[0]?.aggregate) || 0;
    const safeTotalRatingNo = totalRatingNo > 0 ? totalRatingNo : 1;

    /* ---------------- MAIN QUERIES ---------------- */

    let creditRatingQuery = '';
    let queryParams = [];

    if (isIdValid) {
      // Single agency: distribution by rating grade
      creditRatingQuery = `
        SELECT
          MAX(master_agency.short_name) AS label,
          ROUND((COUNT(mir.rating) / ${safeTotalRatingNo}) * 100, 2) AS percentage,
          COUNT(mir.id) AS rating_no,
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'), -6)) AS color,
          mir.rating
        FROM master_agency
        INNER JOIN master_issuer_rating mir
          ON mir.agency_id = master_agency.id
        LEFT JOIN isin_re_issuance i
          ON i.isin_id = mir.issuer_id
        ${filterJoinsSql}
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          ${filterSql}
          AND master_agency.id = ?
        GROUP BY mir.rating
      `;
      queryParams = [sqlStartDate, sqlEndDate, ...filterParams, parsedId];
    } else {
      // Overview: one row per rating grade
      creditRatingQuery = `
        SELECT
          MAX(master_agency.short_name) AS label,
          ROUND((COUNT(mir.rating) / ${safeTotalRatingNo}) * 100, 2) AS percentage,
          COUNT(mir.id) AS rating_no,
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'), -6)) AS color,
          mir.rating
        FROM master_agency
        INNER JOIN master_issuer_rating mir
          ON mir.agency_id = master_agency.id
        LEFT JOIN isin_re_issuance i
          ON i.isin_id = mir.issuer_id
        ${filterJoinsSql}
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          ${filterSql}
        GROUP BY mir.rating
      `;
      queryParams = [sqlStartDate, sqlEndDate, ...filterParams];
    }

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery, ...queryParams);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      };
    });

    res.status(200).json(finalResult);

  } catch (error) {
    console.error('Rating agencies credit rating API error:', error);
    res.status(500).json({
      error: 'Failed to fetch rating agencies credit rating data',
      message: error.message
    });
  }
});

app.post('/agencyPage_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2025-01-01',
      endDate = '2026-01-01',
      limit = 25,
      offset = 0,
      search = ""
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const rating = toArray(req.body.rating);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const listingStatus = toArray(req.body.listingStatus);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);

    // ── Single-select filters (strings) ──
    const issuerName = req.body.issuerName || "";
    const isin = req.body.isin || "";
    const arranger = req.body.arranger || "";
    const registrar = req.body.registrar || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // ─────────────────────
    // Dynamic WHERE conditions
    // ─────────────────────
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    // Ensure the ISIN has at least one rating (agency page specific)
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM master_issuer_rating mir
        WHERE mir.issuer_id = mi.isin_id
      )
    `);

    // Combined search for issuerName and isin
    if (search && search.trim() !== '') {
      conditions.push(`(
        id.issuer_name LIKE ? 
        OR mi.isin LIKE ?
      )`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }

    // Issuer Name (single-select, LIKE filter)
    if (hasFilterValue(issuerName)) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    // ISIN (single-select, LIKE filter)
    if (hasFilterValue(isin)) {
      conditions.push(`mi.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    // Rating (multi-select, 1:N)
    if (hasFilterValue(rating)) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select, 1:N)
    if (hasFilterValue(listingStatus)) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise 
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status 
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select, 1:1 via join)
    if (hasFilterValue(seniority)) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select, 1:1 via join)
    if (hasFilterValue(securedFlag)) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select, 1:1 via join)
    if (hasFilterValue(sector)) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Nature (multi-select, 1:1 via join)
    if (hasFilterValue(nature)) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select, 1:1 via join)
    if (hasFilterValue(ownershipType)) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select, 1:N)
    if (hasFilterValue(creditRatingAgency)) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency ma2 ON ma2.id = mir2.agency_id 
        WHERE mir2.issuer_id = mi.isin_id AND ma2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select, 1:1 via join)
    if (hasFilterValue(securityType)) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select, 1:1 via join)
    if (hasFilterValue(modeOfIssue)) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Arranger (single-select, LIKE, 1:N)
    if (hasFilterValue(arranger)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia 
        JOIN master_arranger ma ON ma.id = ia.arranger_id 
        WHERE ia.issuer_id = mi.isin_id AND ma.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    // Registrar (single-select, LIKE, 1:N)
    if (hasFilterValue(registrar)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir 
        JOIN master_registrar mr ON mr.id = ir.registrar_id 
        WHERE ir.issuer_id = mi.isin_id AND mr.registrar_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ─────────────────────
    // Main data query — derived tables for 1:N relations
    // ─────────────────────
    const dataQuery = `
      SELECT
        mi.isin_id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,

        id.issuer_name AS issuer_name,
        miot.description AS ownership_type,
        mint.description AS nature,
        mbs.description AS sector,
        mst.description AS security_type,
        mmi.description AS mode_of_issue,
        mstc.description AS Seniority,
        mtf.description AS tax_free,
        msf.description AS secured_flag,

        -- 1:N relations pre-aggregated in derived tables
        t.debenture_trustee,
        a.Arranger,
        r.Registrar,
        cr.credit_rating_info,
        cr.credit_rating,
        cr.credit_rating_agency,
        ls.listing_status,
        ls.listing_status_code,
        cp.coupon_rate

      FROM isin_re_issuance mi

      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id

      LEFT JOIN master_issuer m
        ON m.id = mi.isin_id

      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = m.nature_type

      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector

      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue

      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority

      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag

      -- 1. Trustees
      LEFT JOIN (
        SELECT it.issuer_id,
               GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ') AS debenture_trustee
        FROM issuer_trustee it
        JOIN master_trustee mt ON mt.id = it.trustee_id
        GROUP BY it.issuer_id
      ) t ON t.issuer_id = mi.isin_id

      -- 2. Arrangers
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ') AS Arranger
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) a ON a.issuer_id = mi.isin_id

      -- 3. Registrars
      LEFT JOIN (
        SELECT ir.issuer_id,
               GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ') AS Registrar
        FROM issuer_registrar ir
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        GROUP BY ir.issuer_id
      ) r ON r.issuer_id = mi.isin_id

      -- 4. Credit rating info (agency: rating) + separate rating + separate agency
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ') AS credit_rating_info,
               GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ') AS credit_rating,
               GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ') AS credit_rating_agency
        FROM master_issuer_rating mir
        JOIN master_agency mag ON mag.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = mi.isin_id

      -- 5. First listing status (by exchange id)
      LEFT JOIN (
        SELECT issuer_id,
               listing_status AS listing_status_code,
               listing_status_description AS listing_status
        FROM (
          SELECT mise.issuer_id,
                 mise.listing_status,
                 mls.description AS listing_status_description,
                 ROW_NUMBER() OVER (PARTITION BY mise.issuer_id ORDER BY mise.id) AS rn
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = mi.isin_id

      -- 6. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = mi.isin_id

      ${whereClause}

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ─────────────────────
    // Count query — unchanged
    // ─────────────────────
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi

      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id

      LEFT JOIN master_issuer m
        ON m.id = mi.isin_id

      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = m.nature_type

      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector

      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue

      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority

      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag

      ${whereClause}
    `;

    // ─────────────────────
    // Execute queries
    // ─────────────────────
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // ─────────────────────
    // Final formatting
    // ─────────────────────
    const finalResult = result?.map((item) => {
      const allotment = item?.allotment_date
        ? new Date(item?.allotment_date).toISOString().split('T')[0]
        : null;

      const maturity = item?.maturity_date
        ? new Date(item?.maturity_date).toISOString().split('T')[0]
        : null;

      return {
        id: item?.isin_id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate ?? '-',
        creditRatingAgency: item?.credit_rating_agency || '-',
        creditRating: item?.credit_rating || '-',
        debentureTrustee: item?.debenture_trustee || '-',
        registrar: item?.Registrar || '-',
        arranger: item?.Arranger || '-',
        seniority: item?.Seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        nature: item?.nature || '-',
        ownershipType: item?.ownership_type || '-',
        sector: item?.sector || '-',
      };
    });

    // ─────────────────────
    // Response
    // ─────────────────────
    res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('Error in agencyPage_detailed_data:', error);
    res.status(500).json({
      error: 'Failed to fetch detailed agencyPage data',
      message: error.message
    });
  }
});

app.post('/rating_agencies_page_monthly_summary_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31'
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const ownershipType = toArray(req.body.ownershipType);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const securityType = toArray(req.body.securityType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const seniority = toArray(req.body.seniority);
    const taxFree = toArray(req.body.taxFree);
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    // ── Single-select filters (strings) ──
    const dealSize = req.body.dealSize || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ─── Generate expected month list (chronological, includes empty months) ───
    const expectedMonths = getMonthsInRange(currentStartDate, currentEndDate);

    /* ---------------------------------
       HELPER: Build multi-value IN / LIKE clause
    --------------------------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------------------------
       DYNAMIC FILTER BUILDER
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    --------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* ── Base date / visibility ── */
      conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
      params.push(cyStart, cyEnd);
      conditions.push(`mi.is_visible = 1`);

      /* ── 1:N relationship filters (EXISTS = no row multiplication, no joins) ── */

      if (hasFilterValue(rating)) {
        const c = buildInClause('mir.rating', rating);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir_x
            JOIN master_agency ma_x ON ma_x.id = mir_x.agency_id AND ma_x.parent_id = 0
            WHERE mir_x.issuer_id = mi.isin_id AND ${c.clause.replace(/^mir\./, 'mir_x.')}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(creditRatingAgency)) {
        const c = buildInClause('ma_x.short_name', creditRatingAgency);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir_x
            JOIN master_agency ma_x ON ma_x.id = mir_x.agency_id AND ma_x.parent_id = 0
            WHERE mir_x.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(listingStatus)) {
        const c = buildInClause('mls.description', listingStatus);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise
            JOIN master_listing_status mls ON mls.code = mise.listing_status
            WHERE mise.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      /* ── Direct conditions (no join needed) ── */

      if (hasFilterValue(dealSize)) {
        const c = buildInClause('mi.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ── 1:1 lookup filters (dynamic JOINs, added only when needed) ── */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mint
            ON filter_mint.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mint.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = mi.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql = filterJoins.length > 0 ? filterJoins.join('\n') : '';
    const whereClause = filterConditions.length
      ? `WHERE ${filterConditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - Base joins: master_issuer_rating + master_agency (anchor of endpoint)
       - 1:N filters (rating, agency, listing status) handled via EXISTS
       - Only filters with values contribute their JOINs
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.id, '-', mir.agency_id)) AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                            AS issue_size,
        SUM(mi.issue_size)           AS actual_issue_size
      FROM isin_re_issuance mi
      INNER JOIN master_issuer_rating mir
        ON mir.issuer_id = mi.isin_id
      INNER JOIN master_agency mag
        ON mag.id = mir.agency_id
      ${filterJoinsSql}
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...filterParams);

    // ─── Merge SQL results with expected month list (includes empty months) ───
    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,
        noOfIssue: data ? Number(data.no_of_issue ?? 0) : 0,
        issueSize: data ? Number(data.issue_size ?? 0) : 0,
        actualIssueSize: data ? Number(data.actual_issue_size ?? 0) : 0
      };
    });

    res.status(200).json({
      success: true,
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Error in rating_agencies_page_monthly_summary_data:', error);
    res.status(500).json({
      error: 'Failed to fetch rating agencies monthly summary data',
      message: error.message
    });
  }
});

app.post('/rating_agencies_page_monthly_detailed_data', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      month = "",
      limit = 25,
      offset = 0,
      issuerName = [],
      isin = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      creditRatingAgency = [],
      listingStatus = [],
      securityType = [],
      modeOfIssue = [],
      arranger = [],
      debentureTrustee = [],
      registrar = []
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        error: 'startDate must be before or equal to endDate'
      });
    }

    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    const safeMonth = month !== "" ? parseInt(month, 10) : null;
    if (safeMonth !== null && (isNaN(safeMonth) || safeMonth < 1 || safeMonth > 12)) {
      return res.status(400).json({
        success: false,
        error: 'month must be between 1 and 12'
      });
    }

    // =========================
    // HELPER: Build multi-value IN clause
    // =========================
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================
    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Issuer Name filter
    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName) ? issuerName : [issuerName];
      const inClause = buildInClause('id.issuer_name', issuerNameValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // ISIN filter
    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating) ? rating : [rating];
      const inClause = buildInClause('mir2.rating', ratingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Seniority filter
    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority) ? seniority : [seniority];
      const inClause = buildInClause('mstc2.description', seniorityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_seniority_tier_classification mstc2
          WHERE mstc2.code = i.seniority AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Tax Free filter
    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree) ? taxFree : [taxFree];
      const inClause = buildInClause('mtf2.description', taxFreeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_tax_free mtf2
          WHERE mtf2.code = i.tax_free AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Secured Flag filter
    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag) ? securedFlag : [securedFlag];
      const inClause = buildInClause('msf2.description', securedFlagValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_secured_flag msf2
          WHERE msf2.code = i.secured_flag AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Credit Rating Agency filter
    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency) ? creditRatingAgency : [creditRatingAgency];
      const inClause = buildInClause('mag2.short_name', agencyValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Listing Status filter
    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus) ? listingStatus : [listingStatus];
      const inClause = buildInClause('mls2.description', listingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Security Type filter
    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType) ? securityType : [securityType];
      const inClause = buildInClause('mst2.description', securityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_security_type mst2
          WHERE mst2.code = i.security_class AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Mode of Issue filter
    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue) ? modeOfIssue : [modeOfIssue];
      const inClause = buildInClause('mmi2.description', modeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_mode_issue mmi2
          WHERE mmi2.code = i.mode_issue AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Arranger filter
    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger) ? arranger : [arranger];
      const inClause = buildInClause('ma2.short_name', arrangerValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_arranger ia2
          JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
          WHERE ia2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Debenture Trustee filter
    if (hasFilterValue(debentureTrustee)) {
      const trusteeValue = Array.isArray(debentureTrustee) ? debentureTrustee : [debentureTrustee];
      const inClause = buildInClause('mt2.short_name', trusteeValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Registrar filter
    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar) ? registrar : [registrar];
      const inClause = buildInClause('mr2.short_name', registrarValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir2
          JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
          WHERE ir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // =========================
    // FINAL WHERE CLAUSE
    // =========================
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY — derived tables for 1:N relations
    // =========================
    const dataQuery = `
      SELECT
        i.id                              AS issuerId,
        i.isin                            AS isin,
        i.allotment_date                  AS allotment_date,
        i.maturity_date                   AS maturity_date,
        i.security_name                   AS security_name,
        i.issue_size                      AS issue_size,
        i.face_value                      AS face_value,
        i.issuer_master_id                AS issuer_master_id,

        id.issuer_name                    AS issuer_name,
        s.description                     AS security_type,
        mi.description                    AS mode_issue,
        mstc.description                  AS seniority,
        tf.description                    AS tax_free,
        msf.description                   AS secured_flag,

        -- rating-agency axis (intentional row per issuer-agency pair)
        mag.short_name                    AS agency_name,
        mir.rating                        AS rating_value,

        -- pre-aggregated 1:N relations (once per issuer)
        cp.coupon_rate,
        t.debenture_trustee_name,
        r.registrar_detail,
        ar.arranger_name,
        ls.listing_status

      FROM isin_re_issuance i

      INNER JOIN master_issuer_rating mir ON i.isin_id = mir.issuer_id
      INNER JOIN master_agency       mag ON mag.id      = mir.agency_id

      LEFT JOIN issuer_details        id   ON id.id = i.issuer_master_id
      LEFT JOIN master_security_type  s    ON s.code = i.security_class
      LEFT JOIN master_mode_issue     mi   ON mi.code = i.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free       tf   ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag   msf  ON msf.code = i.secured_flag

      -- 1. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = i.isin_id

      -- 2. First trustee (by trustee row id)
      LEFT JOIN (
        SELECT issuer_id, debenture_trustee_name
        FROM (
          SELECT it.issuer_id,
                 mt.short_name AS debenture_trustee_name,
                 ROW_NUMBER() OVER (PARTITION BY it.issuer_id ORDER BY it.id) AS rn
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
        ) x
        WHERE x.rn = 1
      ) t ON t.issuer_id = i.isin_id

      -- 3. First registrar (by registrar row id)
      LEFT JOIN (
        SELECT issuer_id, registrar_detail
        FROM (
          SELECT ir.issuer_id,
                 mr.short_name AS registrar_detail,
                 ROW_NUMBER() OVER (PARTITION BY ir.issuer_id ORDER BY ir.id) AS rn
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
        ) x
        WHERE x.rn = 1
      ) r ON r.issuer_id = i.isin_id

      -- 4. All arrangers (comma-separated)
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') AS arranger_name
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) ar ON ar.issuer_id = i.isin_id

      -- 5. First listing status (by listing_status then id)
      LEFT JOIN (
        SELECT issuer_id, listing_status
        FROM (
          SELECT mise.issuer_id,
                 mls.description AS listing_status,
                 ROW_NUMBER() OVER (
                   PARTITION BY mise.issuer_id
                   ORDER BY mise.listing_status ASC, mise.id ASC
                 ) AS rn
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = i.isin_id

      ${whereClause}

      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — rating-agency axis
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id, mir.agency_id
        FROM isin_re_issuance i
        INNER JOIN master_issuer_rating mir ON i.isin_id = mir.issuer_id
        INNER JOIN master_agency       mag ON mag.id      = mir.agency_id
        LEFT JOIN issuer_details        id  ON id.id = i.issuer_master_id
        LEFT JOIN master_security_type  s   ON s.code = i.security_class
        LEFT JOIN master_mode_issue     mi  ON mi.code = i.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
        LEFT JOIN master_tax_free       tf  ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag   msf ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.id, mir.agency_id, mag.short_name, i.isin
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // =========================
    // DATA FORMATTING
    // =========================
    const formattedData = result.map((item) => {
      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date).toISOString().split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date).toISOString().split('T')[0]
        : '-';

      return {
        issuerId: item?.issuerId || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || '-',
        allotmentDate,
        maturityDate,
        couponRate: item?.coupon_rate || '-',
        debentureTrustee: item?.debenture_trustee_name || '-',
        registrar: item?.registrar_detail || '-',
        rating: item?.rating_value || '-',
        arranger: item?.arranger_name || '-',
        issueSize: Number(item?.issue_size) || 0,
        faceValue: Number(item?.face_value) || 0,
        creditRatingAgency: item?.agency_name || '-',
        seniority: item?.seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        issuerMasterId: item?.issuer_master_id || '-'
      };
    });

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('rating_agencies_page monthly_detailed_data Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch rating agencies monthly detailed data',
      message: error.message
    });
  }
});

app.post('/rating_agency_top_participants_details', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      agencyId,
      SearchQuery = '',
      limit = 25,
      offset = 0,
      sortField = 'issuer_name',
      sortOrder = 'ASC',

      // ── Filters ──
      ownershipType = [],
      nature = [],
      sector = [],
      securityType = [],
      modeOfIssue = [],
      creditRatingAgency = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      listingStatus = [],
      registrar = [],
      trustee = [],
      isin = [],
      issuerName = [],
      arranger = [],
    } = req.body;

    // =========================================================
    // INPUT VALIDATION
    // =========================================================

    if (!startDate || !endDate || !agencyId) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and agencyId are required',
      });
    }

    const parsedAgencyId = parseInt(agencyId, 10);

    if (isNaN(parsedAgencyId) || parsedAgencyId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'agencyId must be a positive integer',
      });
    }

    // =========================================================
    // DATE VALIDATION
    // =========================================================

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (
      isNaN(startDateObj.getTime()) ||
      isNaN(endDateObj.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before or equal to endDate',
      });
    }

    // =========================================================
    // LIMIT / OFFSET
    // =========================================================

    const safeLimit = Math.max(
      1,
      Math.min(1000, Number(limit) || 25)
    );

    const safeOffset = Math.max(
      0,
      Number(offset) || 0
    );

    // =========================================================
    // DATE FORMATTER
    // =========================================================

    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return null;
      }

      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }

      return date
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    // =========================================================
    // SORT CONFIGURATION
    // =========================================================

    const validSortFields = [
      'issuer_name',
      'isin',
      'allotment_date',
      'maturity_date',
      'coupon_rate',
      'issue_size',
      'face_value',
      'security_name',
      'rating',
      'agency_name',
      'listing_status',
    ];

    const orderBy = validSortFields.includes(sortField)
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // =========================================================
    // SEARCH CONFIGURATION
    // =========================================================

    const safeSearchQuery = SearchQuery?.trim() || '';

    const escapeLike = (str) =>
      str.replace(/[%_\\]/g, '\\$&');

    const searchPattern = safeSearchQuery
      ? `%${escapeLike(safeSearchQuery)}%`
      : null;

    // =========================================================
    // HELPER: BUILD IN CLAUSE
    // =========================================================

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) && values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params,
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals,
      };
    };

    // =========================================================
    // BUILD DYNAMIC CONDITIONS
    // =========================================================

    const conditions = [];
    const params = [];

    // ---------------------------------------------------------
    // REQUIRED CONDITIONS
    // ---------------------------------------------------------

    conditions.push(`mir.agency_id = ?`);
    params.push(parsedAgencyId);

    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    conditions.push(`i.is_visible = 1`);

    // =========================================================
    // OWNERSHIP TYPE
    // =========================================================

    if (hasFilterValue(ownershipType)) {
      const ownershipValue = Array.isArray(ownershipType)
        ? ownershipType
        : [ownershipType];

      const inClause = buildInClause(
        'miot2.description',
        ownershipValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2
              ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // NATURE
    // =========================================================

    if (hasFilterValue(nature)) {
      const natureValue = Array.isArray(nature)
        ? nature
        : [nature];

      const inClause = buildInClause(
        'mitn2.description',
        natureValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2
              ON mitn2.code = mi2.nature_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // SECTOR
    // =========================================================

    if (hasFilterValue(sector)) {
      const sectorValue = Array.isArray(sector)
        ? sector
        : [sector];

      const inClause = buildInClause(
        'mbs2.description',
        sectorValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_business_sector mbs2
            WHERE mbs2.code = i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // SECURITY TYPE
    // =========================================================

    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType)
        ? securityType
        : [securityType];

      const inClause = buildInClause(
        'mst2.description',
        securityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_security_type mst2
            WHERE mst2.code = i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // MODE OF ISSUE
    // =========================================================

    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue)
        ? modeOfIssue
        : [modeOfIssue];

      const inClause = buildInClause(
        'mmi2.description',
        modeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_mode_issue mmi2
            WHERE mmi2.code = i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // CREDIT RATING AGENCY
    // =========================================================

    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency)
        ? creditRatingAgency
        : [creditRatingAgency];

      const inClause = buildInClause(
        'mag2.short_name',
        agencyValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            JOIN master_agency mag2
              ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // RATING
    // =========================================================

    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating)
        ? rating
        : [rating];

      const inClause = buildInClause(
        'mir2.rating',
        ratingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // SENIORITY
    // =========================================================

    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority)
        ? seniority
        : [seniority];

      const inClause = buildInClause(
        'mstc2.description',
        seniorityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // TAX FREE
    // =========================================================

    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree)
        ? taxFree
        : [taxFree];

      const inClause = buildInClause(
        'mtf2.description',
        taxFreeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_tax_free mtf2
            WHERE mtf2.code = i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // SECURED FLAG
    // =========================================================

    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag)
        ? securedFlag
        : [securedFlag];

      const inClause = buildInClause(
        'msf2.description',
        securedFlagValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_secured_flag msf2
            WHERE msf2.code = i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // LISTING STATUS
    // =========================================================

    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus)
        ? listingStatus
        : [listingStatus];

      const inClause = buildInClause(
        'mls2.description',
        listingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2
              ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // REGISTRAR
    // =========================================================

    if (hasFilterValue(registrar)) {
      const registrarValue = Array.isArray(registrar)
        ? registrar
        : [registrar];

      const inClause = buildInClause(
        'mr2.short_name',
        registrarValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_registrar ir2
            JOIN master_registrar mr2
              ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // TRUSTEE
    // =========================================================

    if (hasFilterValue(trustee)) {
      const trusteeValue = Array.isArray(trustee)
        ? trustee
        : [trustee];

      const inClause = buildInClause(
        'mt2.short_name',
        trusteeValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_trustee it2
            JOIN master_trustee mt2
              ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // ISIN
    // =========================================================

    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin)
        ? isin
        : [isin];

      const inClause = buildInClause(
        'i.isin',
        isinValue,
        true
      );

      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // =========================================================
    // ISSUER NAME
    // =========================================================

    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName)
        ? issuerName
        : [issuerName];

      const inClause = buildInClause(
        'id2.issuer_name',
        issuerNameValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_details id2
            WHERE id2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // =========================================================
    // ARRANGER
    // =========================================================

    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger)
        ? arranger
        : [arranger];

      const inClause = buildInClause(
        'ma2.short_name',
        arrangerValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_arranger ia2
            JOIN master_arranger ma2
              ON ma2.id = ia2.arranger_id
            WHERE ia2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    const whereClause = conditions.join(' AND ');

    // =========================================================
    // BASE QUERY
    // =========================================================

    const baseQuery = `
      SELECT
        i.id,
        i.isin_id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        i.maturity_date,
        i.security_name,
        i.issue_size,
        i.face_value,
        i.issuer_master_id,

        (
          SELECT GROUP_CONCAT(
            DISTINCT icd.coupon_rate
            SEPARATOR ', '
          )
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = i.isin_id
        ) AS coupon_rate,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mt.short_name
            SEPARATOR ', '
          )
          FROM issuer_trustee it
          JOIN master_trustee mt
            ON mt.id = it.trustee_id
          WHERE it.issuer_id = i.isin_id
        ) AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mr.registrar_name
            SEPARATOR ', '
          )
          FROM issuer_registrar ir
          JOIN master_registrar mr
            ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = i.isin_id
        ) AS registrar_detail,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mir.rating
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          WHERE mir.issuer_id = i.isin_id
        ) AS rating,

        (
          SELECT GROUP_CONCAT(
            DISTINCT ma.short_name
            SEPARATOR ', '
          )
          FROM issuer_arranger ia
          JOIN master_arranger ma
            ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = i.isin_id
        ) AS arranger_name,

        s.description AS security_type,

        mi.description AS mode_issue,

        mag.short_name AS agency_name,

        mstc.description AS seniority,

        tf.description AS tax_free,

        msf.description AS secured_flag,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM isin_re_issuance i

      INNER JOIN master_issuer_rating mir
        ON i.isin_id = mir.issuer_id

      INNER JOIN master_agency mag
        ON mir.agency_id = mag.id

      LEFT JOIN issuer_details id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue mi
        ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code = i.secured_flag

      WHERE ${whereClause}
    `;

    // =========================================================
    // SEARCH CLAUSE
    // =========================================================

    const searchClause = `
      AND (
        issuer_name LIKE ?
        OR isin LIKE ?
        OR coupon_rate LIKE ?
        OR debenture_trustee_name LIKE ?
        OR registrar_detail LIKE ?
        OR rating LIKE ?
        OR arranger_name LIKE ?
        OR security_name LIKE ?
        OR security_type LIKE ?
        OR mode_issue LIKE ?
        OR CAST(issue_size AS CHAR) LIKE ?
        OR CAST(face_value AS CHAR) LIKE ?
        OR agency_name LIKE ?
        OR seniority LIKE ?
        OR tax_free LIKE ?
        OR secured_flag LIKE ?
        OR listing_status LIKE ?
      )
    `;

    const searchParams = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    ];

    // =========================================================
    // DATA QUERY
    // =========================================================

    let dataQuery = `
      SELECT *
      FROM (${baseQuery}) x
      WHERE 1 = 1
    `;

    const dataParams = [...params];

    if (searchPattern) {
      dataQuery += searchClause;
      dataParams.push(...searchParams);
    }

    dataQuery += `
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    dataParams.push(safeLimit, safeOffset);

    // =========================================================
    // NORMAL COUNT QUERY
    // =========================================================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
      WHERE 1 = 1
    `;

    const countParams = [...params];

    if (searchPattern) {
      countQuery += searchClause;
      countParams.push(...searchParams);
    }

    // =========================================================
    // CLUBBED COUNT QUERY
    // =========================================================

    let clubbedCountQuery = `
      SELECT COUNT(*) AS clubbedTotal
      FROM (
        SELECT
          issuer_name,
          DATE(allotment_date) AS allotment_date
        FROM (${baseQuery}) x
        WHERE 1 = 1
    `;

    const clubbedCountParams = [...params];

    if (searchPattern) {
      clubbedCountQuery += searchClause;
      clubbedCountParams.push(...searchParams);
    }

    clubbedCountQuery += `
        GROUP BY
          issuer_name,
          DATE(allotment_date)
      ) clubbed
    `;

    // =========================================================
    // EXECUTE ALL THREE QUERIES
    // =========================================================

    const [
      data,
      totalCount,
      clubbedCount,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams),
      prisma.$queryRawUnsafe(clubbedCountQuery, ...clubbedCountParams),
    ]);

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.json({
      success: true,

      // Individual filtered rows
      totalRecords: Number(totalCount[0]?.total || 0),

      // Unique issuer + allotment date
      clubbedTotalRecords: Number(clubbedCount[0]?.clubbedTotal || 0),

      data,
    });

  } catch (error) {
    console.error(
      'rating_agency_top_participants_details error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});


//updated registrars APIs DONE
app.post('/registrars_page_top_registrars_data', async (req, res) => {
  try {
    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    const {
      startDate,
      endDate,
      issueType,
      limit,
      offset = 0,
      isin = ""
    } = req.body;

    // ── Multi-select filters (arrays) ──
    const creditRating = toArray(req.body.creditRating);
    const registrar = toArray(req.body.registrar);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const businessSector = toArray(req.body.businessSector);
    const issuerNatureType = toArray(req.body.issuerNatureType);
    const issuerOwnershipType = toArray(req.body.issuerOwnershipType);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const listingStatus = toArray(req.body.listingStatus);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);

    // ── VALIDATION ──
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    // Format dates for MySQL (YYYY-MM-DD HH:MM:SS) — local time
    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (date) => {
      const y = date.getFullYear();
      const m = pad(date.getMonth() + 1);
      const d = pad(date.getDate());
      const h = pad(date.getHours());
      const min = pad(date.getMinutes());
      const s = pad(date.getSeconds());
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };

    const currStartStr = formatDate(currentStartDate);
    const currEndStr = formatDate(currentEndDate);
    const prevStartStr = formatDate(previousStartDate);
    const prevEndStr = formatDate(previousEndDate);

    // Validate limit/offset
    const parsedLimit = limit !== undefined && limit !== null ? parseInt(limit, 10) : null;
    const parsedOffset = parseInt(offset, 10) || 0;
    if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit < 0)) {
      return res.status(400).json({ error: 'Invalid limit value' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'Invalid offset value' });
    }

    // Validate & normalize issueType
    const validIssueTypes = ['count', 'issue_size', 'size'];
    const effectiveIssueType = validIssueTypes.includes(issueType) ? issueType : 'issue_size';
    const normalizedIssueType = effectiveIssueType === 'size' ? 'issue_size' : effectiveIssueType;

    /* ─────────────── HELPERS ─────────────── */

    // Build IN / LIKE clause (matches trustees / arrangers reference)
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter((v) => v !== '' && v !== null && v !== undefined)
        : [values].filter((v) => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        return {
          clause: `(${clauses})`,
          params: vals.map((v) => `%${v}%`)
        };
      }

      const placeholders = vals.map(() => '?').join(',');
      return {
        clause: `${field} IN (${placeholders})`,
        params: vals
      };
    };

    /* ─────────────── DYNAMIC FILTER BUILDER ───────────────
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    ──────────────────────────────────────────────────────── */
    const buildFilterParts = (excludeBusinessSector = false) => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      // ── CREDIT RATING ──
      if (hasFilterValue(creditRating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = mi.isin_id
        `);
        const c = buildInClause('filter_mir.rating', creditRating);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── CREDIT RATING AGENCY ──
      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);
        const c = buildInClause('filter_ma_agency.short_name', creditRatingAgency);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── REGISTRAR (multi-select) ──
      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);
        const c = buildInClause('filter_mr.short_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── SENIORITY ──
      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── SECURED FLAG ──
      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── BUSINESS SECTOR ──
      // (Excluded from sector-breakdown query so the GROUP BY sector still works)
      if (!excludeBusinessSector && hasFilterValue(businessSector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);
        const c = buildInClause('filter_mbs.description', businessSector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── ISSUER NATURE TYPE (lives on master_issuer) ──
      if (hasFilterValue(issuerNatureType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mitn.description', issuerNatureType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── ISSUER OWNERSHIP TYPE (lives on master_issuer) ──
      if (hasFilterValue(issuerOwnershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', issuerOwnershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── SECURITY TYPE ──
      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── MODE OF ISSUE ──
      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── LISTING STATUS ──
      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN (
            SELECT
              mise.issuer_id,
              MAX(mls.description) AS listing_status
            FROM master_issuer_stock_exchange mise
            LEFT JOIN master_listing_status mls
              ON mls.code = mise.listing_status
            WHERE mise.listing_status IS NOT NULL
            GROUP BY mise.issuer_id
          ) AS filter_listing_data
            ON filter_listing_data.issuer_id = mi.isin_id
        `);
        const c = buildInClause('filter_listing_data.listing_status', listingStatus);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      // ── ISIN (LIKE) ──
      if (hasFilterValue(isin)) {
        const c = buildInClause('mi.isin', isin, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    /* ── BUILD FILTERS ── */
    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts(false);

    const filterJoinsSql = filterJoins.length > 0 ? filterJoins.join('\n') : '';
    const filterSql = filterConditions.length > 0
      ? `AND ${filterConditions.join(' AND ')}`
      : '';

    // Sector-breakdown filters (exclude businessSector so GROUP BY still works)
    const {
      joins: sectorFilterJoins,
      conditions: sectorFilterConditions,
      params: sectorFilterParams
    } = buildFilterParts(true);

    const sectorFilterJoinsSql = sectorFilterJoins.length > 0
      ? sectorFilterJoins.join('\n')
      : '';
    const sectorFilterSql = sectorFilterConditions.length > 0
      ? `AND ${sectorFilterConditions.join(' AND ')}`
      : '';

    /* ── Helper to safely extract numeric values from Prisma BigInt results ── */
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    /* ── TOTALS ── */
    const totalIssueSizePromise = prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, currStartStr, currEndStr, ...filterParams);

    const totalIssueSizePrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, prevStartStr, prevEndStr, ...filterParams);

    const totalIssuesCountCurrYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, currStartStr, currEndStr, ...filterParams);

    const totalIssuesCountPrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, prevStartStr, prevEndStr, ...filterParams);

    const [
      totalIssueSizeRaw,
      totalIssueSizePrevYearRaw,
      totalIssuesCountCurrYearRaw,
      totalIssuesCountPrevYearRaw
    ] = await Promise.all([
      totalIssueSizePromise,
      totalIssueSizePrevYearPromise,
      totalIssuesCountCurrYearPromise,
      totalIssuesCountPrevYearPromise
    ]);

    const totalIssueSize = safeNumber(totalIssueSizeRaw[0]?.aggregate);
    const totalIssueSizePrevYear = safeNumber(totalIssueSizePrevYearRaw[0]?.aggregate);
    const totalIssuesCountCurrYear = safeNumber(totalIssuesCountCurrYearRaw[0]?.aggregate);
    const totalIssuesCountPrevYear = safeNumber(totalIssuesCountPrevYearRaw[0]?.aggregate);

    const safeTotalIssueSize = totalIssueSize / 10000000 || 1;
    const safeTotalIssueSizePrev = totalIssueSizePrevYear / 10000000 || 1;
    const safeTotalIssuesCount = totalIssuesCountCurrYear || 1;
    const safeTotalIssuesCountPrev = totalIssuesCountPrevYear || 1;

    /* ── MAIN TABLE QUERY ── */
    const paginationClause = parsedLimit !== null && parsedLimit > 0
      ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}`
      : '';

    const t1t2Joins = filterJoinsSql;
    const t1t2Where = filterSql;
    const t1t2Params = filterParams;

    let tableQuery = '';

    if (normalizedIssueType === 'count') {
      tableQuery = `
      SELECT
        t1.id,
        t1.registrar_name,
        t1.no_issues AS cy_issues,
        t1.issue_size AS cy_issue_size,
        t1.arr_rank AS cy_arr_rank,
        t2.no_issues AS py_issues,
        t2.issue_size AS py_issue_size,
        t2.arr_rank AS py_arr_rank,
        ROUND((t1.no_issues / ?) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ?) * 100, 2) AS py_mkt_share,
        CASE
          WHEN (IFNULL(t1.no_issues,0) + IFNULL(t2.no_issues,0)) = 0 THEN 0
          ELSE ROUND(
            ((IFNULL(t1.no_issues,0) - IFNULL(t2.no_issues,0)) /
            (IFNULL(t1.no_issues,0) + IFNULL(t2.no_issues,0))) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mr.id,
          mr.short_name AS registrar_name,
          COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
        ${t1t2Where}
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        ${paginationClause}
      ) t1
      LEFT JOIN (
        SELECT
          mr.id,
          COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
        ${t1t2Where}
        GROUP BY ir.registrar_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    } else {
      tableQuery = `
      SELECT
        t1.id,
        t1.registrar_name,
        t1.no_issues AS cy_issues,
        t1.issue_size AS cy_issue_size,
        t1.arr_rank AS cy_arr_rank,
        t2.no_issues AS py_issues,
        t2.issue_size AS py_issue_size,
        t2.arr_rank AS py_arr_rank,
        ROUND((t1.issue_size / ?) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ?) * 100, 2) AS py_mkt_share,
        CASE
          WHEN (IFNULL(t1.issue_size,0) + IFNULL(t2.issue_size,0)) = 0 THEN 0
          ELSE ROUND(
            ((IFNULL(t1.issue_size,0) - IFNULL(t2.issue_size,0)) /
            (IFNULL(t1.issue_size,0) + IFNULL(t2.issue_size,0))) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mr.id,
          mr.short_name AS registrar_name,
          COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
        ${t1t2Where}
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        ${paginationClause}
      ) t1
      LEFT JOIN (
        SELECT
          mr.id,
          COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
        ${t1t2Where}
        GROUP BY ir.registrar_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableParams = normalizedIssueType === 'count'
      ? [
        safeTotalIssuesCount,
        safeTotalIssuesCountPrev,
        currStartStr, currEndStr, ...t1t2Params,
        prevStartStr, prevEndStr, ...t1t2Params
      ]
      : [
        safeTotalIssueSize,
        safeTotalIssueSizePrev,
        currStartStr, currEndStr, ...t1t2Params,
        prevStartStr, prevEndStr, ...t1t2Params
      ];

    const tableResult = await prisma.$queryRawUnsafe(tableQuery, ...tableParams);

    /* ── TOTAL COUNT FOR PAGINATION ── */
    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS total
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${filterSql}
    `, currStartStr, currEndStr, ...filterParams);

    const totalRecords = safeNumber(totalCountResult[0]?.total);

    /* ── SECTOR BREAKUP QUERY ── */
    const sectorValueSelect =
      normalizedIssueType === 'count'
        ? 'COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedRegistrarsSubQuery = `
      SELECT
        mr.id AS registrar_id,
        mr.short_name AS registrar_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      ${filterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${filterSql}
      GROUP BY ir.registrar_id
      ORDER BY arr_rank
      LIMIT 10
    `;

    const sectorQuery = `
      SELECT
        r.registrar_id AS id,
        r.registrar_name AS name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedRegistrarsSubQuery}) r
      JOIN issuer_registrar ir ON ir.registrar_id = r.registrar_id
      JOIN isin_re_issuance mi ON mi.isin_id = ir.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      ${sectorFilterJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${sectorFilterSql}
      GROUP BY
        r.registrar_id,
        r.registrar_name,
        r.arr_rank,
        mbs.code,
        mbs.description
      ORDER BY
        r.arr_rank,
        value DESC;
    `;

    const sectorData = await prisma.$queryRawUnsafe(
      sectorQuery,
      // Ranked subquery params
      currStartStr, currEndStr, ...filterParams,
      // Outer sector params
      currStartStr, currEndStr, ...sectorFilterParams
    );

    /* ── RESPONSE FORMAT ── */
    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.registrar_name ?? '-',
      currentSize: item.cy_issue_size ?? '-',
      currentDeals: item.cy_issues ?? '-',
      currentMarketShare: item.cy_mkt_share ?? '-',
      previousRank: item.py_arr_rank ?? '-',
      previousSize: item.py_issue_size ?? '-',
      previousDeals: item.py_issues ?? '-',
      previousMarketShare: item.py_mkt_share ?? '-',
      yoyChange: item.yoy ?? '-'
    }));

    const totals = {
      currentSize: Number(safeTotalIssueSize) || 0,
      previousSize: Number(safeTotalIssueSizePrev) || 0,
      currentDeals: Number(safeTotalIssuesCount) || 0,
      previousDeals: Number(safeTotalIssuesCountPrev) || 0,
    };

    res.status(200).json({
      tableData: finalResult,
      sectorData,
      totals,
      pagination: {
        total: totalRecords,
        limit: parsedLimit,
        offset: parsedOffset
      }
    });

  } catch (error) {
    console.error('Error in registrars_page_top_registrars_data:', error);
    res.status(500).json({
      error: 'Failed to fetch registrars data',
      message: error.message
    });
  }
});

app.post('/registrars_page_credit_rating_data', async (req, res) => {
  try {
    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    const {
      startDate,
      endDate,
      isin = ""
    } = req.body;

    // ── Multi-select filters (arrays) ──
    const creditRating = toArray(req.body.creditRating);
    const registrar = toArray(req.body.registrar);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const businessSector = toArray(req.body.businessSector);
    const issuerNatureType = toArray(req.body.issuerNatureType);
    const issuerOwnershipType = toArray(req.body.issuerOwnershipType);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const listingStatus = toArray(req.body.listingStatus);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);

    // ── VALIDATION ──
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate, endDate are required'
      });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Format dates for MySQL (YYYY-MM-DD HH:MM:SS) — use local time
    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (date) => {
      const y = date.getFullYear();
      const m = pad(date.getMonth() + 1);
      const d = pad(date.getDate());
      const h = pad(date.getHours());
      const min = pad(date.getMinutes());
      const s = pad(date.getSeconds());
      return `${y}-${m}-${d} ${h}:${min}:${s}`;
    };

    const currStartStr = formatDate(currentStartDate);
    const currEndStr = formatDate(currentEndDate);

    /* ---------------- HELPER: Build multi-value IN / LIKE clause ---------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------- DYNAMIC FILTER BUILDER ----------------
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    ---------------------------------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* CREDIT RATING */
      if (hasFilterValue(creditRating)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir
            ON filter_mir.issuer_id = i.isin_id
        `);
        const c = buildInClause('filter_mir.rating', creditRating);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* CREDIT RATING AGENCY */
      if (hasFilterValue(creditRatingAgency)) {
        addJoin(`
          LEFT JOIN master_issuer_rating AS filter_mir_agency
            ON filter_mir_agency.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_agency AS filter_ma_agency
            ON filter_ma_agency.id = filter_mir_agency.agency_id
        `);
        const c = buildInClause('filter_ma_agency.short_name', creditRatingAgency);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* REGISTRAR */
      if (hasFilterValue(registrar)) {
        addJoin(`
          LEFT JOIN issuer_registrar AS filter_ir
            ON filter_ir.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_registrar AS filter_mr
            ON filter_mr.id = filter_ir.registrar_id
        `);
        const c = buildInClause('filter_mr.short_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SENIORITY */
      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = i.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURED FLAG */
      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = i.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* BUSINESS SECTOR */
      if (hasFilterValue(businessSector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = i.business_sector
        `);
        const c = buildInClause('filter_mbs.description', businessSector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISSUER NATURE TYPE (nature_type lives on master_issuer) */
      if (hasFilterValue(issuerNatureType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mitn
            ON filter_mitn.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mitn.description', issuerNatureType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISSUER OWNERSHIP TYPE (issuer_ownership_type lives on master_issuer) */
      if (hasFilterValue(issuerOwnershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', issuerOwnershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* LISTING STATUS */
      if (hasFilterValue(listingStatus)) {
        addJoin(`
          LEFT JOIN master_issuer_stock_exchange AS filter_mise
            ON filter_mise.issuer_id = i.isin_id
        `);
        addJoin(`
          LEFT JOIN master_listing_status AS filter_mls
            ON filter_mls.code = filter_mise.listing_status
        `);
        const c = buildInClause('filter_mls.description', listingStatus);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* SECURITY TYPE */
      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = i.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* MODE OF ISSUE */
      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = i.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ISIN */
      if (hasFilterValue(isin)) {
        const c = buildInClause('i.isin', isin, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql =
      filterJoins.length > 0 ? filterJoins.join('\n') : '';

    const filterSql =
      filterConditions.length > 0
        ? ' AND ' + filterConditions.join(' AND ')
        : '';

    /* ---------------- HELPER: safeNumber ---------------- */
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    /* ---------------- TOTAL RATINGS (denominator) ---------------- */

    const totalQuery = `
      SELECT COUNT(*) AS aggregate
      FROM master_issuer_rating
      INNER JOIN isin_re_issuance AS i
        ON i.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = i.isin_id
      ${filterJoinsSql}
      WHERE i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1
      ${filterSql}
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(
      totalQuery,
      currStartStr,
      currEndStr,
      ...filterParams
    );

    const totalCount = safeNumber(totalRatingNo[0]?.aggregate) || 1;

    /* ---------------- MAIN QUERY ---------------- */

    const creditRatingQuery = `
      SELECT
        MAX(master_agency.short_name) AS label,
        ROUND(
          (
            COUNT(master_issuer_rating.rating) /
            ?
          ) * 100,
          2
        ) AS percentage,

        COUNT(master_issuer_rating.id) AS rating_no,

        CONCAT(
          '#',
          SUBSTRING(
            LPAD(
              HEX(ROUND(RAND() * 10000000)),
              6,
              '0'
            ),
            -6
          )
        ) AS color,
        master_issuer_rating.rating AS rating

      FROM master_agency

      INNER JOIN master_issuer_rating
        ON master_issuer_rating.agency_id = master_agency.id

      LEFT JOIN isin_re_issuance AS i
        ON i.isin_id = master_issuer_rating.issuer_id

      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = i.isin_id

      ${filterJoinsSql}

      WHERE i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1

      ${filterSql}

      GROUP BY
        master_issuer_rating.rating;
    `;

    const creditRatingResult = await prisma.$queryRawUnsafe(
      creditRatingQuery,
      totalCount,
      currStartStr,
      currEndStr,
      ...filterParams
    );

    /* ---------------- FINAL RESPONSE ---------------- */
    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.label || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.rating || '-'
      };
    });

    res.status(200).json(finalResult);

  } catch (error) {
    console.error('Error in registrars_page_credit_rating_data:', error);

    res.status(500).json({
      error: 'Failed to fetch registrars credit rating data',
      message: error.message
    });
  }
});

app.post('/registrarPage_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2025-01-01',
      endDate = '2026-01-01',
      limit = 25,
      offset = 0,
      search = ""
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const rating = toArray(req.body.rating);
    const seniority = toArray(req.body.seniority);
    const securedFlag = toArray(req.body.securedFlag);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const ownershipType = toArray(req.body.ownershipType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const listingStatus = toArray(req.body.listingStatus);
    const securityType = toArray(req.body.securityType);
    const modeOfIssue = toArray(req.body.modeOfIssue);

    // ── Single-select filters (strings) ──
    const registrar = req.body.registrar || "";

    // ── VALIDATION ──
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ error: 'Invalid limit value' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'Invalid offset value' });
    }

    // Validate dates
    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ── DYNAMIC WHERE CONDITIONS ──
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1`);
    params.push(cyStart, cyEnd);

    // Ensure the ISIN has at least one registrar
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM issuer_registrar ir
        WHERE ir.issuer_id = mi.isin_id
      )
    `);

    // Search by issuer name or ISIN (single-select LIKE)
    if (search) {
      conditions.push(`(
        id.issuer_name LIKE ? 
        OR mi.isin LIKE ?
      )`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Rating (multi-select) — EXISTS to avoid row multiplication
    if (hasFilterValue(rating)) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select) — EXISTS
    if (hasFilterValue(listingStatus)) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise 
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status 
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (hasFilterValue(seniority)) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (hasFilterValue(securedFlag)) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (hasFilterValue(sector)) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Nature (multi-select)
    if (hasFilterValue(nature)) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (hasFilterValue(ownershipType)) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select) — EXISTS
    if (hasFilterValue(creditRatingAgency)) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        JOIN master_agency ma ON ma.id = mir.agency_id 
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select)
    if (hasFilterValue(securityType)) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (hasFilterValue(modeOfIssue)) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Registrar (single-select, LIKE filter) — EXISTS
    if (hasFilterValue(registrar)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir 
        JOIN master_registrar mr ON mr.id = ir.registrar_id 
        WHERE ir.issuer_id = mi.isin_id AND mr.registrar_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ── SAFE DATE FORMATTER ──
    const formatDateSafe = (dateVal) => {
      if (!dateVal) return null;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    };

    // ── MAIN DATA QUERY — derived tables for 1:N relationships ──
    const dataQuery = `
      SELECT
        mi.id,
        mi.isin_id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,
        id.issuer_name AS issuer_name,
        miot.description AS ownership_type,
        mint.description AS nature,
        mbs.description AS sector,
        mst.description AS security_type,
        mmi.description AS mode_of_issue,
        mstc.description AS Seniority,
        msf.description AS secured_flag,
        mtf.description AS tax_free,

        -- 1:N relations pre-aggregated in derived tables
        t.debenture_trustee,
        a.Arranger,
        r.Registrar,
        cp.coupon_rate,
        crf.credit_rating,
        crf.credit_rating_agency,
        ls.listing_status,
        ls.listing_status_code

      FROM isin_re_issuance mi
      LEFT JOIN issuer_details id ON id.id = mi.issuer_master_id
      LEFT JOIN master_issuer m ON m.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot ON miot.code = m.issuer_ownership_type
      LEFT JOIN master_issuer_type_nature mint ON mint.code = m.nature_type
      LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector
      LEFT JOIN master_security_type mst ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag

      -- 1. Trustees
      LEFT JOIN (
        SELECT it.issuer_id,
               GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ') AS debenture_trustee
        FROM issuer_trustee it
        JOIN master_trustee mt ON mt.id = it.trustee_id
        GROUP BY it.issuer_id
      ) t ON t.issuer_id = mi.isin_id

      -- 2. Arrangers
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ') AS Arranger
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) a ON a.issuer_id = mi.isin_id

      -- 3. Registrars
      LEFT JOIN (
        SELECT ir.issuer_id,
               GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ') AS Registrar
        FROM issuer_registrar ir
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        GROUP BY ir.issuer_id
      ) r ON r.issuer_id = mi.isin_id

      -- 4. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = mi.isin_id

      -- 5. First credit rating (by agency id) + its agency
      LEFT JOIN (
        SELECT issuer_id,
               rating AS credit_rating,
               agency_short_name AS credit_rating_agency
        FROM (
          SELECT mir.issuer_id,
                 mir.rating,
                 ma.short_name AS agency_short_name,
                 ROW_NUMBER() OVER (PARTITION BY mir.issuer_id ORDER BY ma.id) AS rn
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
        ) x
        WHERE x.rn = 1
      ) crf ON crf.issuer_id = mi.isin_id

      -- 6. First listing status (by exchange id)
      LEFT JOIN (
        SELECT issuer_id,
               listing_status AS listing_status_code,
               listing_status_description AS listing_status
        FROM (
          SELECT mise.issuer_id,
                 mise.listing_status,
                 mls.description AS listing_status_description,
                 ROW_NUMBER() OVER (PARTITION BY mise.issuer_id ORDER BY mise.id) AS rn
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = mi.isin_id

      ${whereClause}

      ORDER BY mi.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // ── COUNT QUERY — unchanged ──
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM isin_re_issuance mi
      LEFT JOIN issuer_details id ON id.id = mi.issuer_master_id
      LEFT JOIN master_issuer m ON m.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot ON miot.code = m.issuer_ownership_type
      LEFT JOIN master_issuer_type_nature mint ON mint.code = m.nature_type
      LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector
      LEFT JOIN master_security_type mst ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag
      ${whereClause}
    `;

    // ── EXECUTE QUERIES ──
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    // Safe number extraction from BigInt
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const total = safeNumber(countResult?.[0]?.total);

    // ── FINAL FORMATTING ──
    const finalResult = result?.map((item) => {
      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        allotmentDate: formatDateSafe(item?.allotment_date) || '-',
        maturityDate: formatDateSafe(item?.maturity_date) || '-',
        couponRate: item?.coupon_rate ?? '-',
        creditRatingAgency: item?.credit_rating_agency || '-',
        creditRating: item?.credit_rating || '-',
        debentureTrustee: item?.debenture_trustee || '-',
        registrar: item?.Registrar || '-',
        arranger: item?.Arranger || '-',
        seniority: item?.Seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        nature: item?.nature || '-',
        ownershipType: item?.ownership_type || '-',
        sector: item?.sector || '-',
      };
    });

    // ── RESPONSE ──
    res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + parsedLimit) < total
      }
    });

  } catch (error) {
    console.error('Error in registrarPage_detailed_data:', error);
    res.status(500).json({
      error: 'Failed to fetch detailed registrarPage data',
      message: error.message
    });
  }
});

app.post('/registrar_page_monthly_summary_data', async (req, res) => {
  try {
    const {
      startDate = '2025-04-01',
      endDate = '2026-03-31'
    } = req.body;

    // ── Helper: normalize string/array inputs ──
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ── Multi-select filters (arrays) ──
    const ownershipType = toArray(req.body.ownershipType);
    const sector = toArray(req.body.sector);
    const nature = toArray(req.body.nature);
    const securityType = toArray(req.body.securityType);
    const creditRatingAgency = toArray(req.body.creditRatingAgency);
    const modeOfIssue = toArray(req.body.modeOfIssue);
    const seniority = toArray(req.body.seniority);
    const taxFree = toArray(req.body.taxFree);
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    // ── Single-select filters (strings) ──
    const dealSize = req.body.dealSize || "";
    const registrar = req.body.registrar || "";

    // ─── Validate dates ───
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (currentStartDate > currentEndDate) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }

    // ─── Full day coverage — start at 00:00:00, end at 23:59:59 ───
    const cyStart = formatDateForSQL(new Date(Date.UTC(
      currentStartDate.getUTCFullYear(),
      currentStartDate.getUTCMonth(),
      currentStartDate.getUTCDate(),
      0, 0, 0
    )));
    const cyEnd = formatDateForSQL(new Date(Date.UTC(
      currentEndDate.getUTCFullYear(),
      currentEndDate.getUTCMonth(),
      currentEndDate.getUTCDate(),
      23, 59, 59
    )));

    // ─── Generate expected month list (chronological, includes empty months) ───
    const expectedMonths = getMonthsInRange(currentStartDate, currentEndDate);

    /* ---------------------------------
       HELPER: Build multi-value IN / LIKE clause
    --------------------------------- */
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;

      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);

      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    /* ---------------------------------
       DYNAMIC FILTER BUILDER
       Only add a JOIN when the corresponding filter has a value.
       hasFilterValue() is defined outside this API.
    --------------------------------- */
    const buildFilterParts = () => {
      const joins = [];
      const conditions = [];
      const params = [];
      const addedJoins = new Set();

      const addJoin = (join) => {
        const normalizedJoin = join.trim();
        if (!addedJoins.has(normalizedJoin)) {
          addedJoins.add(normalizedJoin);
          joins.push(normalizedJoin);
        }
      };

      /* ── Base date / visibility ── */
      conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
      params.push(cyStart, cyEnd);
      conditions.push(`mi.is_visible = 1`);

      /* ── 1:N relationship filters (EXISTS = no row multiplication, no joins) ── */

      if (hasFilterValue(rating)) {
        const c = buildInClause('mir.rating', rating);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(creditRatingAgency)) {
        const c = buildInClause('ma.short_name', creditRatingAgency);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir
            JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
            WHERE mir.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      if (hasFilterValue(listingStatus)) {
        const c = buildInClause('mls.description', listingStatus);
        if (c) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise
            JOIN master_listing_status mls ON mls.code = mise.listing_status
            WHERE mise.issuer_id = mi.isin_id AND ${c.clause}
          )`);
          params.push(...c.params);
        }
      }

      /* ── Direct conditions (no join needed) ── */

      if (hasFilterValue(dealSize)) {
        const c = buildInClause('mi.issue_size', dealSize, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      /* ── 1:1 lookup filters (dynamic JOINs, added only when needed) ── */

      if (hasFilterValue(ownershipType)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_ownership
            ON filter_mi_ownership.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_ownership_type AS filter_miot
            ON filter_miot.code = filter_mi_ownership.issuer_ownership_type
        `);
        const c = buildInClause('filter_miot.description', ownershipType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(sector)) {
        addJoin(`
          LEFT JOIN master_business_sector AS filter_mbs
            ON filter_mbs.code = mi.business_sector
        `);
        const c = buildInClause('filter_mbs.description', sector);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(nature)) {
        addJoin(`
          LEFT JOIN master_issuer AS filter_mi_nature
            ON filter_mi_nature.id = mi.isin_id
        `);
        addJoin(`
          LEFT JOIN master_issuer_type_nature AS filter_mint
            ON filter_mint.code = filter_mi_nature.nature_type
        `);
        const c = buildInClause('filter_mint.description', nature);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securityType)) {
        addJoin(`
          LEFT JOIN master_security_type AS filter_mst
            ON filter_mst.code = mi.security_class
        `);
        const c = buildInClause('filter_mst.description', securityType);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(modeOfIssue)) {
        addJoin(`
          LEFT JOIN master_mode_issue AS filter_mmi
            ON filter_mmi.code = mi.mode_issue
        `);
        const c = buildInClause('filter_mmi.description', modeOfIssue);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(seniority)) {
        addJoin(`
          LEFT JOIN master_seniority_tier_classification AS filter_mstc
            ON filter_mstc.code = mi.seniority
        `);
        const c = buildInClause('filter_mstc.description', seniority);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(taxFree)) {
        addJoin(`
          LEFT JOIN master_tax_free AS filter_mtf
            ON filter_mtf.code = mi.tax_free
        `);
        const c = buildInClause('filter_mtf.description', taxFree);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(securedFlag)) {
        addJoin(`
          LEFT JOIN master_secured_flag AS filter_msf
            ON filter_msf.code = mi.secured_flag
        `);
        const c = buildInClause('filter_msf.description', securedFlag);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      if (hasFilterValue(registrar)) {
        // registrar_master is already INNER JOINed in the base FROM; use its alias directly.
        const c = buildInClause('registrar_master.short_name', registrar, true);
        if (c) { conditions.push(c.clause); params.push(...c.params); }
      }

      return { joins, conditions, params };
    };

    const {
      joins: filterJoins,
      conditions: filterConditions,
      params: filterParams
    } = buildFilterParts();

    const filterJoinsSql = filterJoins.length > 0 ? filterJoins.join('\n') : '';
    const whereClause = filterConditions.length
      ? `WHERE ${filterConditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - Base joins: issuer_registrar + master_registrar (anchor of endpoint)
       - 1:N filters (rating, agency, listing status) handled via EXISTS
       - Only filters with values contribute their JOINs
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.id, '-', ir.registrar_id)) AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                            AS issue_size,
        SUM(mi.issue_size)           AS actual_issue_size
      FROM isin_re_issuance mi
      INNER JOIN issuer_registrar ir
        ON ir.issuer_id = mi.isin_id
      INNER JOIN master_registrar registrar_master
        ON registrar_master.id = ir.registrar_id
      ${filterJoinsSql}
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...filterParams);

    // ─── Merge SQL results with expected month list (includes empty months) ───
    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    // Safe number extraction from BigInt
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,
        noOfIssue: data ? safeNumber(data.no_of_issue) : 0,
        issueSize: data ? safeNumber(data.issue_size) : 0,
        actualIssueSize: data ? safeNumber(data.actual_issue_size) : 0
      };
    });

    res.status(200).json({
      success: true,
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Error in registrar_page_monthly_summary_data:', error);
    res.status(500).json({
      error: 'Failed to fetch registrar monthly summary data',
      message: error.message
    });
  }
});

app.post('/registrars_page_monthly_detailed_data', async (req, res) => {
  try {
    const {
      startDate = '2026-04-01',
      endDate = '2026-05-28',
      month = "",
      limit = 25,
      offset = 0,
      registrarName = [],
      issuerName = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      trustee = [],
      creditRatingAgency = [],
      listingStatus = [],
      securityType = [],
      modeOfIssue = [],
      arranger = [],
      isin = []
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'startDate must be before or equal to endDate'
      });
    }

    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    let safeMonth = null;
    if (month !== "" && month !== null && month !== undefined) {
      safeMonth = parseInt(month, 10);
      if (isNaN(safeMonth) || safeMonth < 1 || safeMonth > 12) {
        return res.status(400).json({
          success: false,
          error: 'month must be between 1 and 12'
        });
      }
    }

    // =========================
    // HELPER: Build multi-value IN clause
    // =========================
    const buildInClause = (field, values, useLike = false) => {
      if (!values || (Array.isArray(values) && values.length === 0)) return null;
      const vals = Array.isArray(values)
        ? values.filter(v => v !== '' && v !== null && v !== undefined)
        : [values].filter(v => v !== '' && v !== null && v !== undefined);
      if (vals.length === 0) return null;

      if (useLike) {
        const clauses = vals.map(() => `${field} LIKE ?`).join(' OR ');
        const params = vals.map(v => `%${v}%`);
        return { clause: `(${clauses})`, params };
      }

      const placeholders = vals.map(() => '?').join(',');
      return { clause: `${field} IN (${placeholders})`, params: vals };
    };

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================
    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Registrar Name filter
    if (hasFilterValue(registrarName)) {
      const registrarValue = Array.isArray(registrarName) ? registrarName : [registrarName];
      const inClause = buildInClause('mr2.short_name', registrarValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir2
          JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
          WHERE ir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Issuer Name filter
    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName) ? issuerName : [issuerName];
      const inClause = buildInClause('id2.issuer_name', issuerNameValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_details id2
          WHERE id2.id = i.issuer_master_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // ISIN filter
    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating) ? rating : [rating];
      const inClause = buildInClause('mir2.rating', ratingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Seniority filter
    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority) ? seniority : [seniority];
      const inClause = buildInClause('mstc2.description', seniorityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_seniority_tier_classification mstc2
          WHERE mstc2.code = i.seniority AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Tax Free filter
    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree) ? taxFree : [taxFree];
      const inClause = buildInClause('mtf2.description', taxFreeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_tax_free mtf2
          WHERE mtf2.code = i.tax_free AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Secured Flag filter
    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag) ? securedFlag : [securedFlag];
      const inClause = buildInClause('msf2.description', securedFlagValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_secured_flag msf2
          WHERE msf2.code = i.secured_flag AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Trustee filter
    if (hasFilterValue(trustee)) {
      const trusteeValue = Array.isArray(trustee) ? trustee : [trustee];
      const inClause = buildInClause('mt2.short_name', trusteeValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Credit Rating Agency filter
    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency) ? creditRatingAgency : [creditRatingAgency];
      const inClause = buildInClause('mag2.short_name', agencyValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Listing Status filter
    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus) ? listingStatus : [listingStatus];
      const inClause = buildInClause('mls2.description', listingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Security Type filter
    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType) ? securityType : [securityType];
      const inClause = buildInClause('mst2.description', securityValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_security_type mst2
          WHERE mst2.code = i.security_class AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Mode of Issue filter
    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue) ? modeOfIssue : [modeOfIssue];
      const inClause = buildInClause('mmi2.description', modeValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_mode_issue mmi2
          WHERE mmi2.code = i.mode_issue AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Arranger filter
    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger) ? arranger : [arranger];
      const inClause = buildInClause('ma2.short_name', arrangerValue, true);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_arranger ia2
          JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
          WHERE ia2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // =========================
    // FINAL WHERE CLAUSE
    // =========================
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY — derived tables for 1:N relations
    // =========================
    const dataQuery = `
      SELECT
        i.id                              AS issuerId,
        i.isin                            AS isin,
        i.allotment_date                  AS allotment_date,
        i.maturity_date                   AS maturity_date,
        i.security_name                   AS security_name,
        i.issue_size                      AS issue_size,
        i.face_value                      AS face_value,
        i.issuer_master_id                AS issuer_master_id,

        id.issuer_name                    AS issuer_name,
        s.description                     AS security_type,
        mi.description                    AS mode_issue,
        mstc.description                  AS seniority,
        tf.description                    AS tax_free,
        msf.description                   AS secured_flag,

        -- registrar-centric axis
        ir1.registrar_id                  AS registrar_id,
        mr.short_name                     AS registrar_detail,

        -- pre-aggregated 1:N relations (once per issuer)
        cp.coupon_rate,
        t.debenture_trustee_name,
        cr.rating,
        cr.agency_name,
        cr.rating_info,
        ar.arranger_name,
        ls.listing_status

      FROM isin_re_issuance i

      -- registrar-centric axis (intentional row per (issuer, registrar))
      INNER JOIN issuer_registrar ir1 ON i.isin_id = ir1.issuer_id
      INNER JOIN master_registrar mr  ON mr.id = ir1.registrar_id

      LEFT JOIN issuer_details        id   ON id.id = i.issuer_master_id
      LEFT JOIN master_security_type  s    ON s.code = i.security_class
      LEFT JOIN master_mode_issue     mi   ON mi.code = i.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free       tf   ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag   msf  ON msf.code = i.secured_flag

      -- 1. First coupon rate (by coupon id)
      LEFT JOIN (
        SELECT issuer_id, coupon_rate
        FROM (
          SELECT icd.issuer_id,
                 icd.coupon_rate,
                 ROW_NUMBER() OVER (PARTITION BY icd.issuer_id ORDER BY icd.id) AS rn
          FROM issuer_coupon_details icd
        ) z
        WHERE z.rn = 1
      ) cp ON cp.issuer_id = i.isin_id

      -- 2. First trustee (by trustee row id)
      LEFT JOIN (
        SELECT issuer_id, debenture_trustee_name
        FROM (
          SELECT it.issuer_id,
                 mt.short_name AS debenture_trustee_name,
                 ROW_NUMBER() OVER (PARTITION BY it.issuer_id ORDER BY it.id) AS rn
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
        ) x
        WHERE x.rn = 1
      ) t ON t.issuer_id = i.isin_id

      -- 3. Ratings + agencies (all)
      LEFT JOIN (
        SELECT mir.issuer_id,
               GROUP_CONCAT(DISTINCT mir.rating    ORDER BY mir.rating    ASC SEPARATOR ', ') AS rating,
               GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS agency_name,
               GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ')   AS rating_info
        FROM master_issuer_rating mir
        JOIN master_agency mag ON mag.id = mir.agency_id
        GROUP BY mir.issuer_id
      ) cr ON cr.issuer_id = i.isin_id

      -- 4. All arrangers (comma-separated)
      LEFT JOIN (
        SELECT ia.issuer_id,
               GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') AS arranger_name
        FROM issuer_arranger ia
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        GROUP BY ia.issuer_id
      ) ar ON ar.issuer_id = i.isin_id

      -- 5. First listing status (by listing_status then id)
      LEFT JOIN (
        SELECT issuer_id, listing_status
        FROM (
          SELECT mise.issuer_id,
                 mls.description AS listing_status,
                 ROW_NUMBER() OVER (
                   PARTITION BY mise.issuer_id
                   ORDER BY mise.listing_status ASC, mise.id ASC
                 ) AS rn
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
        ) y
        WHERE y.rn = 1
      ) ls ON ls.issuer_id = i.isin_id

      ${whereClause}

      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — registrar-centric count
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id, ir1.registrar_id
        FROM isin_re_issuance i
        INNER JOIN issuer_registrar ir1 ON i.isin_id = ir1.issuer_id
        INNER JOIN master_registrar mr  ON mr.id = ir1.registrar_id
        LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
        LEFT JOIN master_security_type s ON s.code = i.security_class
        LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
        LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.id, ir1.registrar_id, mr.short_name, i.isin
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, safeLimit, safeOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    // =========================
    // TOTAL
    // =========================
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const total = safeNumber(countResult?.[0]?.total);

    // =========================
    // FORMAT RESPONSE
    // =========================
    const finalResult = result?.map((item) => {
      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date).toISOString().split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date).toISOString().split('T')[0]
        : '-';

      return {
        issuerId: item?.issuerId || '-',
        registrarId: item?.registrar_id || '-',
        registrar: item?.registrar_detail || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || '-',
        allotmentDate,
        maturityDate,
        couponRate: item?.coupon_rate || '-',
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        rating: item?.rating || '-',
        creditRatingAgency: item?.agency_name || '-',
        debentureTrustee: item?.debenture_trustee_name || '-',
        arranger: item?.arranger_name || '-',
        seniority: item?.seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        issuerMasterId: item?.issuer_master_id || '-'
      };
    });

    // =========================
    // RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      data: finalResult,
      pagination: {
        total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error('registrars_page_monthly_detailed_data Error:', error);

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch registrars monthly detailed data',
      message: error.message
    });
  }
});

app.post('/registrar_top_participants_details', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      registrarId,
      SearchQuery = '',
      limit = 25,
      offset = 0,
      sortField = 'issuer_name',
      sortOrder = 'ASC',

      // ── Filters ──
      ownershipType = [],
      nature = [],
      sector = [],
      securityType = [],
      modeOfIssue = [],
      creditRatingAgency = [],
      rating = [],
      seniority = [],
      taxFree = [],
      securedFlag = [],
      listingStatus = [],
      arranger = [],
      trustee = [],
      isin = [],
      issuerName = [],
    } = req.body;

    // ── VALIDATION ──

    if (
      !startDate ||
      !endDate ||
      registrarId === undefined ||
      registrarId === null
    ) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and registrarId are required',
      });
    }

    const parsedRegistrarId = parseInt(registrarId, 10);

    if (isNaN(parsedRegistrarId) || parsedRegistrarId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'registrarId must be a positive integer',
      });
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        message: 'limit must be a non-negative integer',
      });
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'offset must be a non-negative integer',
      });
    }

    // ── DATE FORMATTING ──

    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return null;
      }

      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }

      return date
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before or equal to endDate',
      });
    }

    // ── SORT CONFIGURATION ──

    const validSortFields = [
      'issuer_name',
      'allotment_date',
      'maturity_date',
      'issue_size',
      'coupon_rate',
      'security_name',
      'isin',
      'rating',
      'agency_name',
      'listing_status',
    ];

    const orderBy = validSortFields.includes(sortField)
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // ── SEARCH CONFIGURATION ──

    const searchTerm = SearchQuery?.trim() || '';

    const escapeLike = (str) =>
      str.replace(/[%_\\]/g, '\\$&');

    const searchPattern = searchTerm
      ? `%${escapeLike(searchTerm)}%`
      : null;

    // ── HELPER ──

    const buildInClause = (
      field,
      values,
      useLike = false
    ) => {
      if (
        !values ||
        (Array.isArray(values) && values.length === 0)
      ) {
        return null;
      }

      const vals = Array.isArray(values)
        ? values.filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        )
        : [values].filter(
          (v) =>
            v !== '' &&
            v !== null &&
            v !== undefined
        );

      if (vals.length === 0) {
        return null;
      }

      if (useLike) {
        const clauses = vals
          .map(() => `${field} LIKE ?`)
          .join(' OR ');

        const params = vals.map(
          (v) => `%${v}%`
        );

        return {
          clause: `(${clauses})`,
          params,
        };
      }

      const placeholders = vals
        .map(() => '?')
        .join(',');

      return {
        clause: `${field} IN (${placeholders})`,
        params: vals,
      };
    };

    // ── BUILD CONDITIONS ──

    const conditions = [];
    const params = [];

    // Required:
    // visibility + registrar + date range

    conditions.push(`ir1.registrar_id = ?`);
    params.push(parsedRegistrarId);

    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    conditions.push(`i.is_visible = 1`);

    // ── Ownership Type ──

    if (hasFilterValue(ownershipType)) {
      const ownershipValue = Array.isArray(ownershipType)
        ? ownershipType
        : [ownershipType];

      const inClause = buildInClause(
        'miot2.description',
        ownershipValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2
              ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Nature ──

    if (hasFilterValue(nature)) {
      const natureValue = Array.isArray(nature)
        ? nature
        : [nature];

      const inClause = buildInClause(
        'mitn2.description',
        natureValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2
              ON mitn2.code = mi2.nature_type
            WHERE mi2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Sector ──

    if (hasFilterValue(sector)) {
      const sectorValue = Array.isArray(sector)
        ? sector
        : [sector];

      const inClause = buildInClause(
        'mbs2.description',
        sectorValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_business_sector mbs2
            WHERE mbs2.code = i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Security Type ──

    if (hasFilterValue(securityType)) {
      const securityValue = Array.isArray(securityType)
        ? securityType
        : [securityType];

      const inClause = buildInClause(
        'mst2.description',
        securityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_security_type mst2
            WHERE mst2.code = i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Mode of Issue ──

    if (hasFilterValue(modeOfIssue)) {
      const modeValue = Array.isArray(modeOfIssue)
        ? modeOfIssue
        : [modeOfIssue];

      const inClause = buildInClause(
        'mmi2.description',
        modeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_mode_issue mmi2
            WHERE mmi2.code = i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Credit Rating Agency ──

    if (hasFilterValue(creditRatingAgency)) {
      const agencyValue = Array.isArray(creditRatingAgency)
        ? creditRatingAgency
        : [creditRatingAgency];

      const inClause = buildInClause(
        'mag2.short_name',
        agencyValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            JOIN master_agency mag2
              ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Rating ──

    if (hasFilterValue(rating)) {
      const ratingValue = Array.isArray(rating)
        ? rating
        : [rating];

      const inClause = buildInClause(
        'mir2.rating',
        ratingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Seniority ──

    if (hasFilterValue(seniority)) {
      const seniorityValue = Array.isArray(seniority)
        ? seniority
        : [seniority];

      const inClause = buildInClause(
        'mstc2.description',
        seniorityValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Tax Free ──

    if (hasFilterValue(taxFree)) {
      const taxFreeValue = Array.isArray(taxFree)
        ? taxFree
        : [taxFree];

      const inClause = buildInClause(
        'mtf2.description',
        taxFreeValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_tax_free mtf2
            WHERE mtf2.code = i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Secured Flag ──

    if (hasFilterValue(securedFlag)) {
      const securedFlagValue = Array.isArray(securedFlag)
        ? securedFlag
        : [securedFlag];

      const inClause = buildInClause(
        'msf2.description',
        securedFlagValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_secured_flag msf2
            WHERE msf2.code = i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Listing Status ──

    if (hasFilterValue(listingStatus)) {
      const listingValue = Array.isArray(listingStatus)
        ? listingStatus
        : [listingStatus];

      const inClause = buildInClause(
        'mls2.description',
        listingValue
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2
              ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Arranger ──

    if (hasFilterValue(arranger)) {
      const arrangerValue = Array.isArray(arranger)
        ? arranger
        : [arranger];

      const inClause = buildInClause(
        'ma2.short_name',
        arrangerValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_arranger ia2
            JOIN master_arranger ma2
              ON ma2.id = ia2.arranger_id
            WHERE ia2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── Trustee ──

    if (hasFilterValue(trustee)) {
      const trusteeValue = Array.isArray(trustee)
        ? trustee
        : [trustee];

      const inClause = buildInClause(
        'mt2.short_name',
        trusteeValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_trustee it2
            JOIN master_trustee mt2
              ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    // ── ISIN ──

    if (hasFilterValue(isin)) {
      const isinValue = Array.isArray(isin)
        ? isin
        : [isin];

      const inClause = buildInClause(
        'i.isin',
        isinValue,
        true
      );

      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // ── Issuer Name ──

    if (hasFilterValue(issuerName)) {
      const issuerNameValue = Array.isArray(issuerName)
        ? issuerName
        : [issuerName];

      const inClause = buildInClause(
        'id2.issuer_name',
        issuerNameValue,
        true
      );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_details id2
            WHERE id2.id = i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(...inClause.params);
      }
    }

    const whereClause = conditions.join(' AND ');

    // =========================
    // BASE QUERY
    // =========================

    const baseQuery = `
      SELECT
        i.isin_id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        i.maturity_date,
        i.security_name,
        i.issue_size,
        i.face_value,
        i.issuer_master_id,

        (
          SELECT GROUP_CONCAT(
            DISTINCT icd.coupon_rate
            SEPARATOR ', '
          )
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = i.isin_id
        ) AS coupon_rate,

        mr.short_name AS registrar_detail,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mt.short_name
            SEPARATOR ', '
          )
          FROM issuer_trustee it
          JOIN master_trustee mt
            ON mt.id = it.trustee_id
          WHERE it.issuer_id = i.isin_id
        ) AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mir.rating
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          WHERE mir.issuer_id = i.isin_id
        ) AS rating,

        (
          SELECT GROUP_CONCAT(
            DISTINCT ma.short_name
            SEPARATOR ', '
          )
          FROM issuer_arranger ia
          JOIN master_arranger ma
            ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = i.isin_id
        ) AS arranger_name,

        s.description AS security_type,

        mi.description AS mode_issue,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mag.short_name
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          JOIN master_agency mag
            ON mag.id = mir.agency_id
          WHERE mir.issuer_id = i.isin_id
        ) AS agency_name,

        mstc.description AS seniority,

        tf.description AS tax_free,

        msf.description AS secured_flag,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM isin_re_issuance i

      INNER JOIN issuer_registrar ir1
        ON i.isin_id = ir1.issuer_id

      INNER JOIN master_registrar mr
        ON ir1.registrar_id = mr.id

      LEFT JOIN issuer_details id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue mi
        ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code = i.secured_flag

      WHERE ${whereClause}
    `;

    // =========================
    // SEARCH CONDITIONS
    // =========================

    const searchClause = `
      AND (
        issuer_name LIKE ?
        OR isin LIKE ?
        OR coupon_rate LIKE ?
        OR debenture_trustee_name LIKE ?
        OR registrar_detail LIKE ?
        OR rating LIKE ?
        OR arranger_name LIKE ?
        OR security_name LIKE ?
        OR security_type LIKE ?
        OR mode_issue LIKE ?
        OR CAST(issue_size AS CHAR) LIKE ?
        OR CAST(face_value AS CHAR) LIKE ?
        OR agency_name LIKE ?
        OR seniority LIKE ?
        OR tax_free LIKE ?
        OR secured_flag LIKE ?
        OR listing_status LIKE ?
      )
    `;

    const searchParams = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    ];

    // =========================
    // DATA QUERY
    // =========================

    let dataQuery = `
      SELECT *
      FROM (${baseQuery}) x
      WHERE 1=1
    `;

    const dataParams = [...params];

    if (searchPattern) {
      dataQuery += searchClause;
      dataParams.push(...searchParams);
    }

    dataQuery += `
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    dataParams.push(parsedLimit, parsedOffset);

    // =========================
    // NORMAL COUNT
    // =========================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
      WHERE 1=1
    `;

    const countParams = [...params];

    if (searchPattern) {
      countQuery += searchClause;
      countParams.push(...searchParams);
    }

    // =========================
    // CLUBBED COUNT
    // =========================

    let clubbedCountQuery = `
      SELECT COUNT(*) AS clubbedTotal
      FROM (
        SELECT
          issuer_name,
          DATE(allotment_date) AS allotment_date
        FROM (${baseQuery}) x
        WHERE 1=1
    `;

    const clubbedCountParams = [...params];

    if (searchPattern) {
      clubbedCountQuery += searchClause;
      clubbedCountParams.push(...searchParams);
    }

    clubbedCountQuery += `
        GROUP BY
          issuer_name,
          DATE(allotment_date)
      ) clubbed
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [
      data,
      totalCount,
      clubbedCount,
    ] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams),
      prisma.$queryRawUnsafe(clubbedCountQuery, ...clubbedCountParams),
    ]);

    // =========================
    // RESPONSE
    // =========================

    return res.json({
      success: true,

      // Total individual records
      totalRecords: Number(totalCount[0]?.total || 0),

      // Total unique issuer + allotment date
      clubbedTotalRecords: Number(
        clubbedCount[0]?.clubbedTotal || 0
      ),

      data,
    });

  } catch (error) {
    console.error(
      'registrar top_participants_details error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// ─── Shared utility: Format date for SQL (UTC-safe) ───
function formatDateForSQL(date) {
  // Use UTC methods to avoid timezone shifts
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.abs(hash % 16777215).toString(16).padStart(6, '0');
  return `#${color}`;
}

// ─── Shared utility: Get upcoming March 31 (financial year end) ───
function getUpcomingMarch31(today = new Date()) {
  const currentYear = today.getUTCFullYear();

  // Create March 31 for the current year in UTC
  let march31 = new Date(Date.UTC(currentYear, 2, 31, 23, 59, 59));

  // If today is after March 31, take next year's March 31
  if (today > march31) {
    march31 = new Date(Date.UTC(currentYear + 1, 2, 31, 23, 59, 59));
  }

  return march31;
}

// ─── Shared utility: Get next financial year range (April 1 - March 31) ───
function getNextFinancialYearRange(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth(); // 0 = Jan, 3 = April

  // If we're already in or after April, next FY starts April of next year
  const startYear = month >= 3 ? year + 1 : year;
  const endYear = startYear + 1;

  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0));      // April 1
  const end = new Date(Date.UTC(endYear, 2, 31, 23, 59, 59));      // March 31

  return {
    start: formatDateForSQL(start),
    end: formatDateForSQL(end)
  };
}

// ─── Shared utility: Get short month name ───
function getShortMonthName(fullMonthName) {
  const monthMap = {
    'January': 'Jan', 'February': 'Feb', 'March': 'Mar', 'April': 'Apr',
    'May': 'May', 'June': 'Jun', 'July': 'Jul', 'August': 'Aug',
    'September': 'Sep', 'October': 'Oct', 'November': 'Nov', 'December': 'Dec'
  };
  return monthMap[fullMonthName] || fullMonthName;
}

function getMonthsInRange(startDate, endDate) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const months = [];
  let current = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (current <= end) {
    months.push({
      monthNo: current.getUTCMonth() + 1,
      monthName: monthNames[current.getUTCMonth()]
    });
    current.setUTCMonth(current.getUTCMonth() + 1);
  }

  return months;
}


app.listen(4000, '127.0.0.1', () => {
  console.log('Server running on port 4000');
});