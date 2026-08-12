const express = require('express');
const prisma = require('./db/mysqlDB');
require('dotenv').config();
const app = express();
const cors = require('cors');
const axios = require('axios');
app.use(express.json());
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




// ==========================================
// MAIN ADMIN APIs:
// ==========================================

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

    // ─── Build dynamic WHERE conditions ───
    const conditions = [];
    const filterParams = [];

    // Date range is always first two params for each period
    const dateConditions = `isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1)`;

    if (issuerName) {
      const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (rating) {
      const inClause = buildInClause('master_issuer_rating.rating', rating);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (dealSize) {
      const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (listingStatus) {
      const inClause = buildInClause('listing_data.listing_status', listingStatus);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (seniority) {
      const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (taxFree) {
      const inClause = buildInClause('master_tax_free.description', taxFree);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (securedFlag) {
      const inClause = buildInClause('master_secured_flag.description', securedFlag);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (sector) {
      const inClause = buildInClause('master_business_sector.description', sector);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (trustee) {
      const inClause = buildInClause('master_trustee.short_name', trustee);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (nature) {
      const inClause = buildInClause('master_issuer_type_nature.description', nature);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (ownershipType) {
      const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (creditRatingAgency) {
      const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (securityType) {
      const inClause = buildInClause('master_security_type.description', securityType);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }
    if (modeOfIssue) {
      const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
      if (inClause) {
        conditions.push(inClause.clause);
        filterParams.push(...inClause.params);
      }
    }

    const filterClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id
    `;

    // ─── Total aggregate queries (deduplicated to avoid join inflation) ───
    const totalIssueSizeQuery = `
      SELECT 
        SUM(isin_re_issuance.issue_size) AS aggregate
      FROM isin_re_issuance
      ${baseJoins}
      WHERE ${dateConditions}
      ${filterClause}
    `;

    const totalIssuesCountQuery = `
      SELECT 
        COUNT(isin_re_issuance.isin_id) AS aggregate
      FROM isin_re_issuance
      ${baseJoins}
      WHERE ${dateConditions}
      ${filterClause}
    `;

    // Current year params: [cyStart, cyEnd, ...filterParams]
    const cyParams = [cyStart, cyEnd, ...filterParams];
    // Previous year params: [pyStart, pyEnd, ...filterParams]
    const pyParams = [pyStart, pyEnd, ...filterParams];

    // Execute all 4 totals in parallel
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

    // ─── FIX: Proper divisor calculation ───
    const cySizeDivisor = totalIssueSizeCY / 10000000;
    const pySizeDivisor = totalIssueSizePY / 10000000;
    const cyCountDivisor = totalIssuesCountCY;
    const pyCountDivisor = totalIssuesCountPY;

    // ─── FIX: Build table query with explicit params to avoid any confusion ───
    const rankByCount = issueType === 'count';

    const rankOrder = rankByCount
      ? `COUNT(mi.isin) DESC, ROUND(SUM(mi.issue_size) / 10000000, 2) DESC`
      : `ROUND(SUM(mi.issue_size) / 10000000, 2) DESC, COUNT(mi.isin) DESC`;

    const shareColumn = rankByCount ? 'no_issues' : 'issue_size';
    const cyDivisor = rankByCount ? cyCountDivisor : cySizeDivisor;
    const pyDivisor = rankByCount ? pyCountDivisor : pySizeDivisor;

    // ─── FIX: Use a single CTE-based query instead of running heavy subquery twice ───
    const tableQuery = `
      WITH 
      cy_data AS (
        SELECT
          issuer_details.id,
          issuer_details.issuer_name,
          COUNT(mi.isin) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.issuer_master_id, isin_re_issuance.isin, isin_re_issuance.issue_size
          FROM isin_re_issuance
          ${baseJoins}
          WHERE ${dateConditions} ${filterClause}
        ) AS mi
        JOIN issuer_details ON issuer_details.id = mi.issuer_master_id
        GROUP BY issuer_details.id
        ORDER BY arr_rank
        LIMIT 10
      ),
      py_data AS (
        SELECT
          issuer_details.id,
          issuer_details.issuer_name,
          COUNT(mi.isin) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.issuer_master_id, isin_re_issuance.isin, isin_re_issuance.issue_size
          FROM isin_re_issuance
          ${baseJoins}
          WHERE ${dateConditions} ${filterClause}
        ) AS mi
        JOIN issuer_details ON issuer_details.id = mi.issuer_master_id
        GROUP BY issuer_details.id
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

    // Params: cyParams for cy_data CTE, pyParams for py_data CTE, then divisors for market share
    const tableParams = [
      ...cyParams,      // for cy_data CTE
      ...pyParams,      // for py_data CTE
      cyDivisor, cyDivisor, cyDivisor,  // for cy_mkt_share CASE
      pyDivisor, pyDivisor, pyDivisor   // for py_mkt_share CASE
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
      }
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

    // ─── Build dynamic filter conditions (excluding date range) ───
    const conditions = [];
    const filterParams = [];

    if (issuerName) {
      const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (rating) {
      const inClause = buildInClause('master_issuer_rating.rating', rating);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (dealSize) {
      const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (listingStatus) {
      const inClause = buildInClause('listing_data.listing_status', listingStatus);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (seniority) {
      const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (taxFree) {
      const inClause = buildInClause('master_tax_free.description', taxFree);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (securedFlag) {
      const inClause = buildInClause('master_secured_flag.description', securedFlag);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (sector) {
      const inClause = buildInClause('master_business_sector.description', sector);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (trustee) {
      const inClause = buildInClause('master_trustee.short_name', trustee);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (nature) {
      const inClause = buildInClause('master_issuer_type_nature.description', nature);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (ownershipType) {
      const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (creditRatingAgency) {
      const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (securityType) {
      const inClause = buildInClause('master_security_type.description', securityType);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (modeOfIssue) {
      const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
      if (inClause) { conditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }

    const filterClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id
    `;

    const rankByCount = issueType === 'count';
    const orderColumn = rankByCount ? 'issue_no' : 'issue_size';
    const orderDirection = 'DESC';

    // ─── CTE-based query: FIXED only_full_group_by ───
    const sectorsQuery = `
      WITH 
      cy_data AS (
        SELECT
          mi.business_sector,
          MAX(mbs.description) AS sector_name,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          COUNT(DISTINCT mi.isin) AS issue_no
        FROM (
          SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.business_sector, isin_re_issuance.isin, isin_re_issuance.issue_size
          FROM isin_re_issuance
          ${baseJoins}
          WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
        ) AS mi
        JOIN master_business_sector mbs ON mi.business_sector = mbs.code
        GROUP BY mi.business_sector
        ORDER BY ${orderColumn} ${orderDirection}
        LIMIT 10
      ),
      py_data AS (
        SELECT
          mi.business_sector,
          MAX(mbs.description) AS sector_name,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          COUNT(DISTINCT mi.isin) AS issue_no
        FROM (
          SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.business_sector, isin_re_issuance.isin, isin_re_issuance.issue_size
          FROM isin_re_issuance
          ${baseJoins}
          WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
        ) AS mi
        JOIN master_business_sector mbs ON mi.business_sector = mbs.code
        GROUP BY mi.business_sector
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

    // ─── FIX: Proper null/0 handling with nullish coalescing ───
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

    // ─── Validate required dates ───
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

    // ─── Build dynamic filter conditions (excluding date range) ───
    const filterConditions = [];
    const filterParams = [];

    if (issuerName) {
      const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (rating) {
      const inClause = buildInClause('master_issuer_rating.rating', rating);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (dealSize) {
      const inClause = buildInClause('isin_re_issuance.issue_size', dealSize, true);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (listingStatus) {
      const inClause = buildInClause('listing_data.listing_status', listingStatus);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (seniority) {
      const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (taxFree) {
      const inClause = buildInClause('master_tax_free.description', taxFree);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (securedFlag) {
      const inClause = buildInClause('master_secured_flag.description', securedFlag);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (sector) {
      const inClause = buildInClause('master_business_sector.description', sector);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (trustee) {
      const inClause = buildInClause('master_trustee.short_name', trustee);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (nature) {
      const inClause = buildInClause('master_issuer_type_nature.description', nature);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (ownershipType) {
      const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (creditRatingAgency) {
      const inClause = buildInClause('master_agency.short_name', creditRatingAgency);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (securityType) {
      const inClause = buildInClause('master_security_type.description', securityType);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }
    if (modeOfIssue) {
      const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
      if (inClause) { filterConditions.push(inClause.clause); filterParams.push(...inClause.params); }
    }

    const filterClause = filterConditions.length > 0 ? ` AND ${filterConditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = isin_re_issuance.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = isin_re_issuance.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer ON master_issuer.id = isin_re_issuance.isin_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id
    `;

    // ─── Issue data (current year) ───
    const issueData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(mi.allotment_date) AS month,
        MONTHNAME(mi.allotment_date) AS label,
        ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
        COUNT(mi.isin) AS isin_count
      FROM (
        SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.allotment_date, isin_re_issuance.isin, isin_re_issuance.issue_size
        FROM isin_re_issuance
        ${baseJoins}
        WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
      ) AS mi
      GROUP BY month, label
      ORDER BY month ASC
    `, cyStart, cyEnd, ...filterParams);

    // ─── Redemption data (current year) ───
    const redemptionData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(mi.maturity_date) AS month,
        MONTHNAME(mi.maturity_date) AS label,
        ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
        COUNT(mi.isin) AS isin_count
      FROM (
        SELECT DISTINCT isin_re_issuance.isin_id, isin_re_issuance.maturity_date, isin_re_issuance.isin, isin_re_issuance.issue_size
        FROM isin_re_issuance
        ${baseJoins}
        WHERE isin_re_issuance.maturity_date BETWEEN ? AND ? AND (isin_re_issuance.is_visible = 1) ${filterClause}
      ) AS mi
      GROUP BY month, label
      ORDER BY month ASC
    `, cyStart, cyEnd, ...filterParams);

    // ─── FIX: Generate month ranges using parsed dates ───
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

    // ─── FIX: Optimized outstanding queries — batch by quarter to reduce N+1 ───
    const outstandingPromises = allMonthRanges.map(async ({ label, start, end }) => {
      const [result] = await prisma.$queryRawUnsafe(`
        SELECT ROUND(SUM(mi.issue_size) / 10000000, 2) AS aggregate
        FROM (
          SELECT isin_re_issuance.isin_id, isin_re_issuance.issue_size
          FROM isin_re_issuance
          ${baseJoins}
          WHERE isin_re_issuance.allotment_date < ?
          AND isin_re_issuance.maturity_date > ?
          AND isin_re_issuance.is_visible = 1
          AND master_issuer.security_status = 1
          ${filterClause}
        ) AS mi
      `, end, end, ...filterParams);

      return {
        label,
        outstanding: result?.aggregate ?? 0
      };
    });

    const outstandingData = await Promise.all(outstandingPromises);

    // ─── FIX: Build lookup maps for O(1) access ───
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

    // ─── Validate required dates ───
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

    const cyStart = formatDateForSQL(currentStartDate);
    const cyEnd = formatDateForSQL(currentEndDate);

    // ─── Validate id parameter ───
    const agencyId = id ? Number(id) : null;
    const isDrillDown = agencyId !== null && !isNaN(agencyId) && agencyId > 0;

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

    // ─── Build dynamic filter conditions ───
    const conditions = [];
    const params = [];

    conditions.push(`i.allotment_date BETWEEN ? AND ?  AND (i.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    if (issuerName) {
      const inClause = buildInClause('issuer_details.issuer_name', issuerName, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (rating) {
      const inClause = buildInClause('mir.rating', rating);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (dealSize) {
      const inClause = buildInClause('i.issue_size', dealSize, true);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (listingStatus) {
      const inClause = buildInClause('listing_data.listing_status', listingStatus);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (seniority) {
      const inClause = buildInClause('master_seniority_tier_classification.description', seniority);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (taxFree) {
      const inClause = buildInClause('master_tax_free.description', taxFree);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (securedFlag) {
      const inClause = buildInClause('master_secured_flag.description', securedFlag);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (sector) {
      const inClause = buildInClause('master_business_sector.description', sector);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (trustee) {
      const inClause = buildInClause('master_trustee.short_name', trustee);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (nature) {
      const inClause = buildInClause('master_issuer_type_nature.description', nature);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (ownershipType) {
      const inClause = buildInClause('master_issuer_ownership_type.description', ownershipType);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (creditRatingAgency) {
      const inClause = buildInClause('ma.short_name', creditRatingAgency);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (securityType) {
      const inClause = buildInClause('master_security_type.description', securityType);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }
    if (modeOfIssue) {
      const inClause = buildInClause('master_mode_issue.description', modeOfIssue);
      if (inClause) { conditions.push(inClause.clause); params.push(...inClause.params); }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ─── FIX: Calculate filtered total, not unfiltered total ───
    const totalQuery = `
      SELECT COUNT(mir.id) as aggregate 
      FROM master_issuer_rating mir
      INNER JOIN master_agency ma ON ma.id = mir.agency_id
      INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
      LEFT JOIN issuer_details ON issuer_details.id = i.issuer_master_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = i.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = i.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = i.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = i.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = i.isin_id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer ON master_issuer.id = i.isin_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = i.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = i.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = i.isin_id
      ${whereClause}
    `;

    const totalResult = await prisma.$queryRawUnsafe(totalQuery, ...params);
    const totalRatingNo = Number(totalResult[0]?.aggregate) || 0;

    // ─── Base joins needed for filters ───
    const baseJoins = `
      INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
      LEFT JOIN issuer_details ON issuer_details.id = i.issuer_master_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = i.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = i.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = i.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = i.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = i.isin_id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer ON master_issuer.id = i.isin_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = i.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = i.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status 
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = i.isin_id
    `;

    let mainQuery = '';
    const mainParams = [...params];

    if (isDrillDown) {
      // Drill-down by agency: group by individual rating
      mainQuery = `
        SELECT 
          ma.short_name as label, 
          COUNT(mir.id) as rating_no,
          mir.rating 
        FROM master_agency ma
        INNER JOIN master_issuer_rating mir ON mir.agency_id = ma.id 
        ${baseJoins}
        ${whereClause}
          AND ma.id = ?
        GROUP BY mir.rating, ma.short_name
      `;
      mainParams.push(agencyId);
    } else {
      // Overview: group by agency only — FIX: removed mir.rating from SELECT
      mainQuery = `
        SELECT 
          ma.short_name as label, 
          COUNT(mir.id) as rating_no,
          ma.id as agency_id
        FROM master_agency ma
        INNER JOIN master_issuer_rating mir ON mir.agency_id = ma.id 
        ${baseJoins}
        ${whereClause}
        GROUP BY ma.id, ma.short_name
      `;
    }

    const result = await prisma.$queryRawUnsafe(mainQuery, ...mainParams);

    // ─── FIX: Calculate percentage in JS to avoid SQL injection and handle total=0 ───
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
      }
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
    // ─── Helper: normalize string/array inputs ───
    const toArray = (val) => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'string') return [val];
      return [];
    };

    // ─── Multi-select filters (arrays) ───
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

    // ─── Validate and sanitize inputs ───
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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

    // ─── Build dynamic filter conditions ───
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    if (search && search.trim() !== "") {
      conditions.push(`(mi.isin LIKE ? OR id.issuer_name LIKE ?)`);
      const searchPattern = `%${search.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    // ── 1:1 lookup filters (safe to JOIN — no row multiplication) ──
    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    // ── 1:N relationship filters (EXISTS = no row multiplication) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    if (trustee.length > 0) {
      const ph = trustee.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE it.issuer_id = mi.isin_id AND mt.short_name IN (${ph})
      )`);
      params.push(...trustee);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ─── Base joins: only 1:1 relationships (no row multiplication) ───
    const baseJoins = `
      INNER JOIN master_issuer m
        ON m.id = mi.isin_id
      LEFT JOIN issuer_details id
        ON id.id = mi.issuer_master_id
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = m.nature_type
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = m.issuer_ownership_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free
    `;

    // ─── Data query: scalar subqueries for 1:N relationships (old query pattern) ───
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
        COALESCE(id.issuer_name, id.issuer_name) AS issuer_name,
        mbs.description                    AS sector,
        mint.description                   AS nature,
        miot.description                   AS ownership_type,
        mst.description                    AS security_type,
        mmi.description                    AS mode_of_issue,
        mstc.description                   AS seniority,
        msf.description                    AS secured_flag,
        mtf.description                    AS tax_free,
        -- 1:N lookups via scalar subqueries (prevents cartesian products)
        (SELECT mls.description
         FROM master_issuer_stock_exchange mise
         LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
         WHERE mise.issuer_id = mi.isin_id AND mise.listing_status IS NOT NULL
         ORDER BY mise.listing_status LIMIT 1) AS listing_status,
        (SELECT coupon_rate
         FROM issuer_coupon_details
         WHERE issuer_id = mi.isin_id
         LIMIT 1)                         AS coupon_rate,
        (SELECT mir.rating
         FROM master_issuer_rating mir
         JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
         WHERE mir.issuer_id = mi.isin_id
         LIMIT 1)                         AS credit_rating,
        (SELECT ma.short_name
         FROM master_issuer_rating mir
         JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
         WHERE mir.issuer_id = mi.isin_id
         LIMIT 1)                         AS credit_rating_agency,
        (SELECT mt.short_name
         FROM issuer_trustee it
         JOIN master_trustee mt ON mt.id = it.trustee_id
         WHERE it.issuer_id = mi.isin_id
         LIMIT 1)                         AS debenture_trustee,
        (SELECT mr.registrar_name
         FROM issuer_registrar ir
         JOIN master_registrar mr ON mr.id = ir.registrar_id
         WHERE ir.issuer_id = mi.isin_id
         LIMIT 1)                         AS registrar,
        (SELECT ma.short_name
         FROM issuer_arranger ia
         JOIN master_arranger ma ON ma.id = ia.arranger_id
         WHERE ia.issuer_id = mi.isin_id
         LIMIT 1)                         AS arranger
      FROM isin_re_issuance mi
      ${baseJoins}
      ${whereClause}
      ORDER BY mi.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // ─── Count query: same joins, no DISTINCT needed ───
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM isin_re_issuance mi
      ${baseJoins}
      ${whereClause}
    `;

    // Execute both queries in parallel
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult[0]?.total) || 0;

    const finalResult = result.map((item) => {
      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;

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
      }
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
    const listingStatus = toArray(req.body.listingStatus);
    const securedFlag = toArray(req.body.securedFlag);
    const rating = toArray(req.body.rating);

    // ─── Validate dates ───
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
       BUILD DYNAMIC CONDITIONS
       - Direct WHERE for 1:1 lookups (no row multiplication)
       - EXISTS subqueries for 1:N lookups (prevents cartesian products)
    --------------------------------- */
    const conditions = [];
    const params = [];

    // Base filters
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    // ── 1:1 lookup filters (safe to JOIN directly) ──
    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    // ── 1:N relationship filters (EXISTS = no DISTINCT needed) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT (EXISTS handles dedup logic)
       - No MONTHNAME (month names come from JS)
       - Direct aggregation on base table
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date) AS issue_month_no,
        COUNT(mi.isin)           AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                        AS issue_size,
        SUM(mi.issue_size)       AS actual_issue_size
      FROM isin_re_issuance mi
      LEFT JOIN issuer_details
        ON issuer_details.id = mi.issuer_master_id
      LEFT JOIN master_issuer
        ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = master_issuer.nature_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // ─── Merge SQL results with expected month list (includes empty months) ───
    const resultMap = new Map();
    for (const row of result) {
      resultMap.set(Number(row.issue_month_no), row);
    }

    const finalResult = expectedMonths.map((month) => {
      const data = resultMap.get(month.monthNo);
      return {
        issueMonthNo: month.monthNo,
        issueMonth: month.monthName,   // ← reliable JS-generated name
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

    // ─── Validate and sanitize inputs ───
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

    // ─── FIX: UTC-safe full day coverage ───
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
    // BUILD DYNAMIC CONDITIONS
    // =========================

    const conditions = [];
    const params = [];

    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`i.is_visible = 1`);

    // Issuer Name filter (LIKE search, array support)
    if (issuerName && (Array.isArray(issuerName) ? issuerName.length > 0 : issuerName !== '')) {
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

    // ISIN filter (LIKE search, array support)
    if (isin && (Array.isArray(isin) ? isin.length > 0 : isin !== '')) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (rating && (Array.isArray(rating) ? rating.length > 0 : rating !== '')) {
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
    if (seniority && (Array.isArray(seniority) ? seniority.length > 0 : seniority !== '')) {
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
    if (taxFree && (Array.isArray(taxFree) ? taxFree.length > 0 : taxFree !== '')) {
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
    if (securedFlag && (Array.isArray(securedFlag) ? securedFlag.length > 0 : securedFlag !== '')) {
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
    if (trustee && (Array.isArray(trustee) ? trustee.length > 0 : trustee !== '')) {
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
    if (creditRatingAgency && (Array.isArray(creditRatingAgency) ? creditRatingAgency.length > 0 : creditRatingAgency !== '')) {
      const agencyValue = Array.isArray(creditRatingAgency) ? creditRatingAgency : [creditRatingAgency];
      const inClause = buildInClause('mag2.short_name', agencyValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency mag2 ON mag2.id = mir2.agency_id AND mag2.parent_id = 0
          WHERE mir2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Listing Status filter
    if (listingStatus && (Array.isArray(listingStatus) ? listingStatus.length > 0 : listingStatus !== '')) {
      const listingValue = Array.isArray(listingStatus) ? listingStatus : [listingStatus];
      const inClause = buildInClause('mls2.description', listingValue);
      if (inClause) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise2
          LEFT JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.isin_id AND ${inClause.clause}
        )`);
        params.push(...inClause.params);
      }
    }

    // Security Type filter
    if (securityType && (Array.isArray(securityType) ? securityType.length > 0 : securityType !== '')) {
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
    if (modeOfIssue && (Array.isArray(modeOfIssue) ? modeOfIssue.length > 0 : modeOfIssue !== '')) {
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
    if (arranger && (Array.isArray(arranger) ? arranger.length > 0 : arranger !== '')) {
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
    if (registrar && (Array.isArray(registrar) ? registrar.length > 0 : registrar !== '')) {
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

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ─── Base joins: match old query exactly ───
    const baseJoins = `
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
      LEFT JOIN issuer_arranger AS ia
        ON i.isin_id = ia.issuer_id
      LEFT JOIN master_arranger AS ma
        ON ia.arranger_id = ma.id
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
    `;

    // =========================
    // DATA QUERY
    // =========================

    const dataQuery = `
      SELECT
        i.isin_id AS issuerId,
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
        (SELECT description 
         FROM master_issuer_stock_exchange AS mise
         LEFT JOIN master_listing_status AS mls ON mls.code = mise.listing_status
         WHERE mise.issuer_id = i.isin_id
         ORDER BY mise.listing_status LIMIT 1) AS listing_status,
        ANY_VALUE(i.issuer_master_id) AS issuer_master_id
      FROM isin_re_issuance AS i
      ${baseJoins}
      ${whereClause}
      GROUP BY i.isin_id, i.isin
      ORDER BY ANY_VALUE(id.issuer_name) ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY
    // =========================

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.isin
        FROM isin_re_issuance AS i
        ${baseJoins}
        ${whereClause}
        GROUP BY i.isin_id, i.isin
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // =========================
    // FORMAT RESPONSE
    // =========================

    const finalResult = result.map((item) => {
      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;

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

    // =========================
    // RESPONSE
    // =========================

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

    // ─── Sanitize limit and offset ───
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 25, 1), 100);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    // ─── Build IN clause placeholders ───
    const idPlaceholders = issuerIds.map(() => '?').join(', ');

    // ─── Shared listing data subquery ───
    const listingDataJoin = `
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status, 
          MAX(mise.listing_status) AS listing_status_code
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = isin_re_issuance.isin_id
    `;

    const resultQuery = `
      SELECT DISTINCT
        isin_re_issuance.isin,
        isin_re_issuance.series,
        isin_re_issuance.convertible_flag,
        isin_re_issuance.option_flag,
        isin_re_issuance.tier_classification,
        isin_re_issuance.security_name,
        isin_re_issuance.issue_size,
        isin_re_issuance.face_value,
        isin_re_issuance.allotment_date,
        isin_re_issuance.maturity_date,
        isin_re_issuance.call_desc,
        isin_re_issuance.put_desc,
        isin_re_issuance.isin_desc,
        isin_re_issuance.convertible_details,
        isin_re_issuance.stipulation_details,
        isin_re_issuance.guaranteed,
        isin_re_issuance.if_taxable,
        isin_re_issuance.allotment_qty,
        isin_re_issuance.stepupdwnbasis,
        isin_re_issuance.stepupdwndtls,
        isin_re_issuance.call_option,
        isin_re_issuance.put_option,
        isin_re_issuance.infra_category,
        isin_re_issuance.issue_price,
        isin_re_issuance.fintrpydte,
        isin_re_issuance.freq,
        isin_re_issuance.freq_dis,
        isin_re_issuance.next_sch_date,
        isin_re_issuance.intratupto,
        isin_re_issuance.intratlkto,
        isin_re_issuance.created_by,
        isin_re_issuance.created_at,
        isin_re_issuance.updated_by,
        isin_re_issuance.updated_at,
        master_interest_type.description AS interest_type,
        master_perpetual_nature_indicator.description AS perpetual_nature,
        master_guaranteed_type.description AS guaranteed_type,
        master_convertible_type_a.description AS convertible_type_a, 
        master_convertible_type_b.description AS convertible_type_b,
        master_cra_status.description AS rated_flag,
        master_day_count.description AS day_count,
        master_frequency.description AS compound_frequency,
        issuer_details.issuer_name AS issuer_name,
        issuer_details.issuer_former_name AS issuer_former_name,
        listing_data.listing_status AS listing_status,
        listing_data.listing_status_code AS listing_status_code,
        master_issuer_type_nature.description AS nature,
        master_issuer_ownership_type.description AS ownership_type,
        master_security_type.description AS security_type,
        master_mode_issue.description AS mode_of_issue,
        issuer_coupon_details.coupon_rate,
        master_issuer_rating.rating AS credit_rating,
        master_agency.short_name AS credit_rating_agency,
        master_trustee.short_name AS debenture_trustee,
        master_registrar.registrar_name AS Registrar,
        master_arranger.short_name AS Arranger,
        master_seniority_tier_classification.description AS Seniority,
        master_tax_free.description AS tax_free,
        master_secured_flag.description AS secured_flag,
        master_business_sector.description AS sector
      FROM isin_re_issuance
      ${listingDataJoin}
      LEFT JOIN master_issuer 
        ON master_issuer.id = isin_re_issuance.isin_id
      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN issuer_details 
        ON issuer_details.id = isin_re_issuance.issuer_master_id
      LEFT JOIN master_day_count 
        ON master_day_count.code = isin_re_issuance.day_count
      LEFT JOIN master_frequency 
        ON master_frequency.code = isin_re_issuance.compound_frequency
      LEFT JOIN master_cra_status 
        ON master_cra_status.code = isin_re_issuance.rated_flag
      LEFT JOIN master_convertible_type_a 
        ON master_convertible_type_a.code = isin_re_issuance.convertible_type_a
      LEFT JOIN master_convertible_type_b
        ON master_convertible_type_b.code = isin_re_issuance.convertible_type_b
      LEFT JOIN master_guaranteed_type 
        ON master_guaranteed_type.code = isin_re_issuance.guaranteed_type
      LEFT JOIN master_perpetual_nature_indicator 
        ON master_perpetual_nature_indicator.code = isin_re_issuance.perpetual_nature
      LEFT JOIN master_interest_type 
        ON master_interest_type.code = isin_re_issuance.interest_type
      LEFT JOIN master_security_type 
        ON master_security_type.code = isin_re_issuance.security_class
      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = isin_re_issuance.mode_issue
      LEFT JOIN issuer_coupon_details 
        ON issuer_coupon_details.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_issuer_rating 
        ON master_issuer_rating.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_agency 
        ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN issuer_trustee 
        ON issuer_trustee.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_trustee 
        ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN issuer_registrar 
        ON issuer_registrar.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_registrar 
        ON master_registrar.id = issuer_registrar.registrar_id
      LEFT JOIN issuer_arranger 
        ON issuer_arranger.issuer_id = isin_re_issuance.isin_id
      LEFT JOIN master_arranger 
        ON master_arranger.id = issuer_arranger.arranger_id
      LEFT JOIN master_seniority_tier_classification 
        ON master_seniority_tier_classification.code = isin_re_issuance.seniority
      LEFT JOIN master_tax_free 
        ON master_tax_free.code = isin_re_issuance.tax_free
      LEFT JOIN master_secured_flag 
        ON master_secured_flag.code = isin_re_issuance.secured_flag
      LEFT JOIN master_business_sector 
        ON master_business_sector.code = isin_re_issuance.business_sector
      WHERE isin_re_issuance.isin_id IN (${idPlaceholders})
      ORDER BY isin_re_issuance.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    const couponTypeDataQuery = `
      SELECT 
        issuer_id, 
        coupon_pay_date, 
        coupon_rate_date, 
        coupon_rate,
        master_coupon_type.description AS coupon_type
      FROM issuer_coupon_details 
      LEFT JOIN master_coupon_type
        ON master_coupon_type.code = issuer_coupon_details.coupon_type
      WHERE issuer_coupon_details.issuer_id IN (${idPlaceholders})
    `;

    const tenureDataQuery = `
      SELECT 
        issuer_id, 
        tenure, 
        tenure_no_years, 
        tenure_no_months, 
        tenure_no_days 
      FROM issuer_tenure_details 
      WHERE issuer_tenure_details.issuer_id IN (${idPlaceholders})
    `;

    const redemptionTypeDataQuery = `
      SELECT 
        issuer_id, 
        redmp_premimum_date, 
        defaultinredmptn, 
        redmp_details,
        master_redemption_type.description AS type_redmptn
      FROM issuer_redemption_details 
      LEFT JOIN master_redemption_type
        ON master_redemption_type.code = issuer_redemption_details.type_redmptn
      WHERE issuer_redemption_details.issuer_id IN (${idPlaceholders})
    `;

    const masterIssuerAdditionalDataQuery = `
      SELECT 
        issuer_id, 
        cin, 
        macro, 
        sector, 
        industry, 
        basicIndustry, 
        amountRaised, 
        greenShoeOption, 
        redemptionDate, 
        category, 
        trancheNumber, 
        natureOfInstrument, 
        objectOfIssue, 
        scheduledOpeningDate, 
        scheduledClosingDate, 
        actualClosingDate 
      FROM master_issuer_additional 
      WHERE master_issuer_additional.issuer_id IN (${idPlaceholders})
    `;

    // ─── FIX: Use parameterized queries with sanitized values ───
    const queryParams = [...issuerIds, parsedLimit, parsedOffset];
    const idParams = [...issuerIds];

    const [result, couponTypeData, tenureData, redemptionTypeData, masterIssuerAdditionalData] = await Promise.all([
      prisma.$queryRawUnsafe(resultQuery, ...queryParams),
      prisma.$queryRawUnsafe(couponTypeDataQuery, ...idParams),
      prisma.$queryRawUnsafe(tenureDataQuery, ...idParams),
      prisma.$queryRawUnsafe(redemptionTypeDataQuery, ...idParams),
      prisma.$queryRawUnsafe(masterIssuerAdditionalDataQuery, ...idParams)
    ]);

    // ─── FIX: Preserve response format (flat merge) but handle empty results ───
    const overAll = {
      ...(result?.[0] || {}),
      ...(couponTypeData?.[0] || {}),
      ...(tenureData?.[0] || {}),
      ...(redemptionTypeData?.[0] || {}),
      ...(masterIssuerAdditionalData?.[0] || {})
    };

    res.status(200).json(overAll);

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

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- HELPER: Build multi-value IN clause ---------------- */
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

    /* ---------------- DYNAMIC FILTER BUILDER ---------------- */
    const buildFilterConditions = (tableAlias = 'mi') => {
      const conditions = [];
      const params = [];

      if (rating) {
        const inClause = buildInClause('mir2.rating', rating);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            JOIN master_agency ma2 ON ma2.id = mir2.agency_id
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (creditRatingAgency) {
        const inClause = buildInClause('ma2.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            JOIN master_agency ma2 ON ma2.id = mir2.agency_id
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (registrar) {
        const inClause = buildInClause('mr2.registrar_name', registrar, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_registrar ir2
            JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (arranger) {
        const inClause = buildInClause('ma2.short_name', arranger, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_arranger ia2
            JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
            WHERE ia2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (seniority) {
        const inClause = buildInClause('mstc2.description', seniority);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = ${tableAlias}.seniority AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (taxFree) {
        const inClause = buildInClause('mtf2.description', taxFree);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_tax_free mtf2
            WHERE mtf2.code = ${tableAlias}.tax_free AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securedFlag) {
        const inClause = buildInClause('msf2.description', securedFlag);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_secured_flag msf2
            WHERE msf2.code = ${tableAlias}.secured_flag AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (sector) {
        const inClause = buildInClause('mbs2.description', sector);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_business_sector mbs2
            WHERE mbs2.code = ${tableAlias}.business_sector AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (trustee) {
        const inClause = buildInClause('mt2.short_name', trustee);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_trustee it2
            JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature) {
        const inClause = buildInClause('mitn2.description', nature);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType) {
        const inClause = buildInClause('miot2.description', ownershipType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (dealSize) {
        const inClause = buildInClause(`${tableAlias}.issue_size`, dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      if (listingStatus) {
        const inClause = buildInClause('mls2.description', listingStatus);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securityType) {
        const inClause = buildInClause('mst2.description', securityType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_security_type mst2
            WHERE mst2.code = ${tableAlias}.security_class AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (modeOfIssue) {
        const inClause = buildInClause('mmi2.description', modeOfIssue);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_mode_issue mmi2
            WHERE mmi2.code = ${tableAlias}.mode_issue AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (isin) {
        const inClause = buildInClause(`${tableAlias}.isin`, isin, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return { conditions, params };
    };

    const {
      conditions: filterConditions,
      params: filterParams
    } = buildFilterConditions('mi');

    const filterSql = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : '';

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);
    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);

    /* ---------------- TOTALS ---------------- */

    const totalIssueSize = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(mi.issue_size) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(mi.issue_size) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${filterSql}
    `, pyStart, pyEnd, ...filterParams);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, pyStart, pyEnd, ...filterParams);

    // Fix: Properly handle zero aggregates. Use nullish coalescing for raw values,
    // but keep actual totals for market share denominator (can be 0).
    const totalCyCount = Number(totalIssuesCountCurrYear[0]?.aggregate) || 0;
    const totalPyCount = Number(totalIssuesCountPrevYear[0]?.aggregate) || 0;
    const totalCySize = Number(totalIssueSize[0]?.aggregate) || 0;
    const totalPySize = Number(totalIssueSizePrevYear[0]?.aggregate) || 0;

    // Fix: Use actual totals for denominator. When 0, market share will be 0 (not 100%).
    const cyCountDenominator = totalCyCount || 1;
    const pyCountDenominator = totalPyCount || 1;
    const cySizeDenominator = totalCySize ? totalCySize / 10000000 : 1;
    const pySizeDenominator = totalPySize ? totalPySize / 10000000 : 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    // Fix: Validate and sanitize limit/offset properly
    const safeLimit = limit ? Math.max(0, parseInt(limit, 10) || 0) : null;
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
    const t1Limit = safeLimit !== null && safeLimit > 0
      ? `LIMIT ${safeLimit} OFFSET ${safeOffset}`
      : '';

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
            ma.id,
            ma.short_name AS arranger_name,
            COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
          ORDER BY arr_rank
          ${t1Limit}
        ) t1
        LEFT JOIN (
          SELECT
            ma.id,
            COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
        ) t2 ON t1.id = t2.id
        ORDER BY t1.arr_rank;
      `;

      tableBaseParams = [
        cyCountDenominator,
        pyCountDenominator,
        cyStart, cyEnd,
        ...filterParams,
        pyStart, pyEnd,
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
            ma.id,
            ma.short_name AS arranger_name,
            COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
          ORDER BY arr_rank
          ${t1Limit}
        ) t1
        LEFT JOIN (
          SELECT
            ma.id,
            COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
        ) t2 ON t1.id = t2.id
        ORDER BY t1.arr_rank;
      `;

      tableBaseParams = [
        cySizeDenominator,
        pySizeDenominator,
        cyStart, cyEnd,
        ...filterParams,
        pyStart, pyEnd,
        ...filterParams
      ];
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery, ...tableBaseParams);

    /* ---------------- TOTAL COUNT FOR PAGINATION ---------------- */

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) AS total
      FROM isin_re_issuance mi
      JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalRecords = parseInt(totalCountResult[0]?.total) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedArrangersSubQuery =
      issueType === 'count'
        ? `
          SELECT
            ma.id AS arranger_id,
            ma.short_name AS arranger_name,
            RANK() OVER (
              ORDER BY COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
          ORDER BY arr_rank
          LIMIT 10
        `
        : `
          SELECT
            ma.id AS arranger_id,
            ma.short_name AS arranger_name,
            RANK() OVER (
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT ia.arranger_id, mi.allotment_date, mi.issuer_master_id) DESC
            ) AS arr_rank
          FROM isin_re_issuance mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.isin_id
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
          ${filterSql}
          GROUP BY ia.arranger_id, ma.id, ma.short_name
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
      JOIN issuer_arranger ia ON ia.arranger_id = r.arranger_id
      JOIN isin_re_issuance mi ON mi.isin_id = ia.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
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
      cyStart, cyEnd, ...filterParams,
      cyStart, cyEnd, ...filterParams
    ];

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery, ...sectorParams);

    /* ---------------- RESPONSE FORMAT ---------------- */

    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.arranger_name ?? '-',
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
      currentSize: Number(totalIssueSize[0]?.aggregate / 10000000) || 0,
      previousSize: Number(totalIssueSizePrevYear[0]?.aggregate / 10000000) || 0,
      currentDeals: Number(totalIssuesCountCurrYear[0]?.aggregate) || 0,
      previousDeals: Number(totalIssuesCountPrevYear[0]?.aggregate) || 0,
    };

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
    console.error(error);
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

    /* ---------------- HELPER: Build multi-value IN clause ---------------- */
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

    /* ---------------- DYNAMIC FILTER BUILDER ---------------- */
    const buildFilterConditions = (tableAlias = 'i') => {
      const conditions = [];
      const params = [];

      if (rating) {
        const inClause = buildInClause('mir2.rating', rating);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (creditRatingAgency) {
        const inClause = buildInClause('mag2.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            JOIN master_agency mag2 ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (registrar) {
        const inClause = buildInClause('mr2.registrar_name', registrar, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_registrar ir2
            JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (arranger) {
        const inClause = buildInClause('ma2.short_name', arranger, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_arranger ia2
            JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
            WHERE ia2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (seniority) {
        const inClause = buildInClause('mstc2.description', seniority);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = ${tableAlias}.seniority AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (taxFree) {
        const inClause = buildInClause('mtf2.description', taxFree);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_tax_free mtf2
            WHERE mtf2.code = ${tableAlias}.tax_free AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securedFlag) {
        const inClause = buildInClause('msf2.description', securedFlag);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_secured_flag msf2
            WHERE msf2.code = ${tableAlias}.secured_flag AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (sector) {
        const inClause = buildInClause('mbs2.description', sector);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_business_sector mbs2
            WHERE mbs2.code = ${tableAlias}.business_sector AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (trustee) {
        const inClause = buildInClause('mt2.short_name', trustee);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_trustee it2
            JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature) {
        const inClause = buildInClause('mitn2.description', nature);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType) {
        const inClause = buildInClause('miot2.description', ownershipType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (dealSize) {
        const inClause = buildInClause(`${tableAlias}.issue_size`, dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      if (listingStatus) {
        const inClause = buildInClause('mls2.description', listingStatus);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securityType) {
        const inClause = buildInClause('mst2.description', securityType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_security_type mst2
            WHERE mst2.code = ${tableAlias}.security_class AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (modeOfIssue) {
        const inClause = buildInClause('mmi2.description', modeOfIssue);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_mode_issue mmi2
            WHERE mmi2.code = ${tableAlias}.mode_issue AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (isin) {
        const inClause = buildInClause(`${tableAlias}.isin`, isin, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
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

    /* ---------------- TOTALS (percentage denominator) ---------------- */
    const totalRatingQuery = `
      SELECT COUNT(master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      INNER JOIN isin_re_issuance i ON i.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger ON issuer_arranger.issuer_id = i.isin_id
      INNER JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
        ${filterSql}
    `;

    const totalRatingParams = [cyStart, cyEnd];
    totalRatingParams.push(...filterParams);

    const totalRatingResult = await prisma.$queryRawUnsafe(totalRatingQuery, ...totalRatingParams);
    const totalRatingCount = Number(totalRatingResult[0]?.aggregate) || 0;
    const totalRatingNo = totalRatingCount || 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const creditRatingQuery = `
        SELECT
          MAX(master_agency.short_name) AS label,
          ROUND(
            (COUNT(master_issuer_rating.rating) / ?) * 100,
            2
          ) AS percentage,
          COUNT(master_issuer_rating.id) AS rating_no,
          CONCAT('#', SUBSTRING((LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)), -6)) AS color,   
          GROUP_CONCAT(DISTINCT master_issuer_rating.rating ORDER BY master_issuer_rating.rating ASC SEPARATOR ', ') AS rating
        FROM master_agency
        INNER JOIN master_issuer_rating
          ON master_issuer_rating.agency_id = master_agency.id
        LEFT JOIN isin_re_issuance AS i
          ON i.isin_id = master_issuer_rating.issuer_id
        INNER JOIN issuer_arranger
          ON issuer_arranger.issuer_id = i.isin_id
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          ${filterSql}
        GROUP BY master_issuer_rating.rating
        ORDER BY percentage DESC, rating_no DESC
    `;

    const creditRatingParams = [totalRatingNo, cyStart, cyEnd];
    creditRatingParams.push(...filterParams);

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery, ...creditRatingParams);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.label || '-',
        percentage: totalRatingCount === 0 ? 0 : (Number(item?.percentage) || 0),
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.rating || '-'
      }
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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

    // Fix: Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // ---------------------
    // Dynamic WHERE conditions
    // ---------------------
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    // Fix: Use EXISTS for arranger check to avoid JOIN duplication issues
    conditions.push(`
      EXISTS (
        SELECT 1 
        FROM issuer_arranger ia 
        WHERE ia.issuer_id = mi.isin_id
      )
    `);

    // ---------------------
    // Filters (using EXISTS with IN for multi-select)
    // ---------------------

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
    if (rating.length > 0) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        WHERE mir2.issuer_id = mi.isin_id AND mir2.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Credit Rating Agency (multi-select)
    if (creditRatingAgency.length > 0) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency mag2 ON mag2.id = mir2.agency_id
        WHERE mir2.issuer_id = mi.isin_id AND mag2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Listing Status (multi-select)
    if (listingStatus.length > 0) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2
        JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
        WHERE mise2.issuer_id = mi.isin_id AND mls2.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (seniority.length > 0) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_seniority_tier_classification mstc2
        WHERE mstc2.code = mi.seniority AND mstc2.description IN (${placeholders})
      )`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (securedFlag.length > 0) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_secured_flag msf2
        WHERE msf2.code = mi.secured_flag AND msf2.description IN (${placeholders})
      )`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (sector.length > 0) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_business_sector mbs2
        WHERE mbs2.code = mi.business_sector AND mbs2.description IN (${placeholders})
      )`);
      params.push(...sector);
    }

    // Trustee (multi-select)
    if (trustee.length > 0) {
      const placeholders = trustee.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
        WHERE it2.issuer_id = mi.isin_id AND mt2.short_name IN (${placeholders})
      )`);
      params.push(...trustee);
    }

    // Nature (multi-select)
    if (nature.length > 0) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer mi2
        JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
        WHERE mi2.id = mi.isin_id AND mitn2.description IN (${placeholders})
      )`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (ownershipType.length > 0) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer mi2
        JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
        WHERE mi2.id = mi.isin_id AND miot2.description IN (${placeholders})
      )`);
      params.push(...ownershipType);
    }

    // Security Type (multi-select)
    if (securityType.length > 0) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_security_type mst2
        WHERE mst2.code = mi.security_class AND mst2.description IN (${placeholders})
      )`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (modeOfIssue.length > 0) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_mode_issue mmi2
        WHERE mmi2.code = mi.mode_issue AND mmi2.description IN (${placeholders})
      )`);
      params.push(...modeOfIssue);
    }

    // Arranger (single-select, LIKE filter)
    if (arranger) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia2
        JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
        WHERE ia2.issuer_id = mi.isin_id AND ma2.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    // Registrar (single-select, LIKE filter)
    if (registrar) {
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
    // Main data query — scalar subqueries for 1:N relationships
    // ---------------------
    const dataQuery = `
      SELECT
        mi.id,
        mi.isin_id,
        mi.isin,
        ANY_VALUE(mi.security_name) AS security_name,
        ANY_VALUE(mi.issue_size) AS issue_size,
        ANY_VALUE(mi.face_value) AS face_value,
        ANY_VALUE(mi.allotment_date) AS allotment_date,
        ANY_VALUE(mi.maturity_date) AS maturity_date,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(miot.description) AS ownership_type,
        ANY_VALUE(mitn.description) AS nature,
        ANY_VALUE(mbs.description) AS sector,
        ANY_VALUE(mst.description) AS security_type,
        ANY_VALUE(mmi.description) AS mode_of_issue,
        (SELECT coupon_rate FROM issuer_coupon_details WHERE issuer_id = mi.isin_id LIMIT 1) AS coupon_rate,
        ANY_VALUE(mstc.description) AS seniority,
        ANY_VALUE(msf.description) AS secured_flag,
        (SELECT GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') 
         FROM issuer_arranger ia 
         JOIN master_arranger ma ON ma.id = ia.arranger_id 
         WHERE ia.issuer_id = mi.isin_id) AS Arranger,
        (SELECT GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') 
         FROM master_issuer_rating mir 
         WHERE mir.issuer_id = mi.isin_id) AS credit_rating,
        (SELECT GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') 
         FROM master_issuer_rating mir 
         JOIN master_agency mag ON mag.id = mir.agency_id 
         WHERE mir.issuer_id = mi.isin_id) AS credit_rating_agency,
        (SELECT GROUP_CONCAT(DISTINCT mt.short_name ORDER BY mt.short_name ASC SEPARATOR ', ') 
         FROM issuer_trustee it 
         JOIN master_trustee mt ON mt.id = it.trustee_id 
         WHERE it.issuer_id = mi.isin_id) AS debenture_trustee,
        (SELECT GROUP_CONCAT(DISTINCT mr.registrar_name ORDER BY mr.registrar_name ASC SEPARATOR ', ') 
         FROM issuer_registrar ir 
         JOIN master_registrar mr ON mr.id = ir.registrar_id 
         WHERE ir.issuer_id = mi.isin_id) AS Registrar,
        (SELECT mls.description 
         FROM master_issuer_stock_exchange mise 
         INNER JOIN master_listing_status mls ON mls.code = mise.listing_status 
         WHERE mise.issuer_id = mi.isin_id 
         ORDER BY mise.listing_status ASC, mise.id ASC 
         LIMIT 1) AS listing_status
      FROM isin_re_issuance mi
      LEFT JOIN issuer_details id ON id.id = mi.issuer_master_id
      LEFT JOIN master_issuer ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_issuer_type_nature mitn ON mitn.code = master_issuer.nature_type
      LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector
      LEFT JOIN master_security_type mst ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority
      LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag
      ${whereClause}
      GROUP BY mi.id, mi.isin_id, mi.isin
      ORDER BY ANY_VALUE(mi.allotment_date) ASC
      LIMIT ? OFFSET ?
    `;

    // ---------------------
    // Count query
    // ---------------------
    const countQuery = `
      SELECT COUNT(mi.isin_id) AS total
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

    // Fix: Safe parsing with fallback
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */
    const conditions = [];
    const params = [];

    // Base filters
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    // ── 1:N relationship filters (EXISTS = no row multiplication) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    // ── 1:1 lookup filters (safe to JOIN directly) ──
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (taxFree.length > 0) {
      const ph = taxFree.map(() => '?').join(', ');
      conditions.push(`mtf.description IN (${ph})`);
      params.push(...taxFree);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    if (arranger) {
      conditions.push(`ma2.short_name LIKE ?`);
      params.push(`%${arranger}%`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT subquery
       - No 1:N LEFT JOINs (ratings, listing_status moved to EXISTS)
       - Direct aggregation
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.isin_id, '-', ia.arranger_id)) AS no_of_issue,
        IF(
          SUM(mi.issue_size) > 0,
          ROUND(SUM(mi.issue_size) / 10000000, 2),
          0
        )                            AS issue_size,
        SUM(mi.issue_size)           AS actual_issue_size
      FROM isin_re_issuance mi
      INNER JOIN issuer_arranger ia
        ON ia.issuer_id = mi.isin_id
      LEFT JOIN master_issuer 
        ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = master_issuer.nature_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      LEFT JOIN master_arranger ma2
        ON ma2.id = ia.arranger_id
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // ─── FIX: Merge SQL results with expected month list (includes empty months) ───
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
    if (arranger) {
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
    if (issuerName) {
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
    if (isin && (Array.isArray(isin) ? isin.length > 0 : isin !== '')) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter
    if (rating && (Array.isArray(rating) ? rating.length > 0 : rating !== '')) {
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
    if (seniority && (Array.isArray(seniority) ? seniority.length > 0 : seniority !== '')) {
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
    if (taxFree && (Array.isArray(taxFree) ? taxFree.length > 0 : taxFree !== '')) {
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
    if (securedFlag && (Array.isArray(securedFlag) ? securedFlag.length > 0 : securedFlag !== '')) {
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
    if (trustee && (Array.isArray(trustee) ? trustee.length > 0 : trustee !== '')) {
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
    if (creditRatingAgency && (Array.isArray(creditRatingAgency) ? creditRatingAgency.length > 0 : creditRatingAgency !== '')) {
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
    if (listingStatus && (Array.isArray(listingStatus) ? listingStatus.length > 0 : listingStatus !== '')) {
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
    if (securityType && (Array.isArray(securityType) ? securityType.length > 0 : securityType !== '')) {
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
    if (modeOfIssue && (Array.isArray(modeOfIssue) ? modeOfIssue.length > 0 : modeOfIssue !== '')) {
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
    if (registrar && (Array.isArray(registrar) ? registrar.length > 0 : registrar !== '')) {
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
    if (sector && (Array.isArray(sector) ? sector.length > 0 : sector !== '')) {
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
    if (nature && (Array.isArray(nature) ? nature.length > 0 : nature !== '')) {
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
    if (ownershipType && (Array.isArray(ownershipType) ? ownershipType.length > 0 : ownershipType !== '')) {
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
    // DATA QUERY — scalar subqueries for 1:N relationships
    // =========================
    const dataQuery = `
      SELECT
        i.isin_id AS issuerId,
        ia.arranger_id,
        ma.short_name AS arranger_name,
        i.isin,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(i.allotment_date) AS allotment_date,
        (SELECT coupon_rate 
         FROM issuer_coupon_details 
         WHERE issuer_id = i.isin_id 
         LIMIT 1) AS coupon_rate,
        (SELECT mt.short_name 
         FROM issuer_trustee it 
         JOIN master_trustee mt ON mt.id = it.trustee_id 
         WHERE it.issuer_id = i.isin_id 
         LIMIT 1) AS debenture_trustee_name,
        (SELECT mr.short_name 
         FROM issuer_registrar ir 
         JOIN master_registrar mr ON mr.id = ir.registrar_id 
         WHERE ir.issuer_id = i.isin_id 
         LIMIT 1) AS registrar_detail,
        ANY_VALUE(i.maturity_date) AS maturity_date,
        (SELECT GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') 
         FROM master_issuer_rating mir 
         WHERE mir.issuer_id = i.isin_id) AS rating,
        ANY_VALUE(i.security_name) AS security_name,
        ANY_VALUE(s.description) AS security_type,
        ANY_VALUE(mi.description) AS mode_issue,
        ANY_VALUE(i.issue_size) AS issue_size,
        ANY_VALUE(i.face_value) AS face_value,
        (SELECT GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') 
         FROM master_issuer_rating mir 
         JOIN master_agency mag ON mag.id = mir.agency_id 
         WHERE mir.issuer_id = i.isin_id) AS agency_name,
        ANY_VALUE(mstc.description) AS seniority,
        ANY_VALUE(tf.description) AS tax_free,
        ANY_VALUE(msf.description) AS secured_flag,
        (SELECT mls.description 
         FROM master_issuer_stock_exchange AS mise 
         INNER JOIN master_listing_status AS mls ON mls.code = mise.listing_status 
         WHERE mise.issuer_id = i.isin_id 
         ORDER BY mise.listing_status ASC, mise.id ASC 
         LIMIT 1) AS listing_status,
        ANY_VALUE(i.issuer_master_id) AS issuer_master_id
      FROM isin_re_issuance AS i
      INNER JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
      INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      LEFT JOIN issuer_details AS id ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi ON i.mode_issue = mi.code
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf ON msf.code = i.secured_flag
      ${whereClause}
      GROUP BY i.isin_id, ia.arranger_id, ma.short_name, i.isin
      ORDER BY ANY_VALUE(id.issuer_name) ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — no 1:N joins, accurate count
    // =========================
    const countQuery = `
      SELECT COUNT(CONCAT(i.isin_id, '-', ia.arranger_id)) AS total
      FROM isin_re_issuance AS i
      INNER JOIN issuer_arranger AS ia ON i.isin_id = ia.issuer_id
      INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      ${whereClause}
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

    // Validate dates
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

    // Validate arrangerId
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

    // Validate limit / offset
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

    if (
      ownershipType &&
      (
        Array.isArray(ownershipType)
          ? ownershipType.length > 0
          : ownershipType !== ''
      )
    ) {
      const ownershipValue = Array.isArray(
        ownershipType
      )
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

    if (
      nature &&
      (
        Array.isArray(nature)
          ? nature.length > 0
          : nature !== ''
      )
    ) {
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

    if (
      sector &&
      (
        Array.isArray(sector)
          ? sector.length > 0
          : sector !== ''
      )
    ) {
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

    if (
      securityType &&
      (
        Array.isArray(securityType)
          ? securityType.length > 0
          : securityType !== ''
      )
    ) {
      const securityValue = Array.isArray(
        securityType
      )
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

    if (
      modeOfIssue &&
      (
        Array.isArray(modeOfIssue)
          ? modeOfIssue.length > 0
          : modeOfIssue !== ''
      )
    ) {
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

    if (
      creditRatingAgency &&
      (
        Array.isArray(creditRatingAgency)
          ? creditRatingAgency.length > 0
          : creditRatingAgency !== ''
      )
    ) {
      const agencyValue = Array.isArray(
        creditRatingAgency
      )
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

    if (
      rating &&
      (
        Array.isArray(rating)
          ? rating.length > 0
          : rating !== ''
      )
    ) {
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

    if (
      seniority &&
      (
        Array.isArray(seniority)
          ? seniority.length > 0
          : seniority !== ''
      )
    ) {
      const seniorityValue = Array.isArray(
        seniority
      )
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

    if (
      taxFree &&
      (
        Array.isArray(taxFree)
          ? taxFree.length > 0
          : taxFree !== ''
      )
    ) {
      const taxFreeValue = Array.isArray(
        taxFree
      )
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

    if (
      securedFlag &&
      (
        Array.isArray(securedFlag)
          ? securedFlag.length > 0
          : securedFlag !== ''
      )
    ) {
      const securedFlagValue = Array.isArray(
        securedFlag
      )
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

    if (
      listingStatus &&
      (
        Array.isArray(listingStatus)
          ? listingStatus.length > 0
          : listingStatus !== ''
      )
    ) {
      const listingValue = Array.isArray(
        listingStatus
      )
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

    if (
      registrar &&
      (
        Array.isArray(registrar)
          ? registrar.length > 0
          : registrar !== ''
      )
    ) {
      const registrarValue = Array.isArray(
        registrar
      )
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

    if (
      trustee &&
      (
        Array.isArray(trustee)
          ? trustee.length > 0
          : trustee !== ''
      )
    ) {
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

    if (
      isin &&
      (
        Array.isArray(isin)
          ? isin.length > 0
          : isin !== ''
      )
    ) {
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

    if (
      issuerName &&
      (
        Array.isArray(issuerName)
          ? issuerName.length > 0
          : issuerName !== ''
      )
    ) {
      const issuerNameValue = Array.isArray(
        issuerName
      )
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
        i.isin_id AS issuerId,
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
    //
    // This is the original count:
    // Number of individual rows returned by baseQuery
    //
    // Example:
    //
    // ABC | 2026-05-10 | ISIN1
    // ABC | 2026-05-10 | ISIN2
    // ABC | 2026-05-10 | ISIN3
    // XYZ | 2026-05-11 | ISIN4
    //
    // total = 4
    //
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
    //
    // This counts unique combinations of:
    //
    //     issuer_name
    //     allotment_date
    //
    // after applying all base filters and SearchQuery.
    //
    // Example:
    //
    // ABC | 2026-05-10 | ISIN1
    // ABC | 2026-05-10 | ISIN2
    // ABC | 2026-05-10 | ISIN3
    // XYZ | 2026-05-11 | ISIN4
    //
    // clubbedTotal = 2
    //
    // IMPORTANT:
    // DATE() is used so rows on the same calendar date are
    // considered the same allotment date even if the underlying
    // datetime has different time portions.
    //
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
      issuerId:
        item?.issuerId ?? '-',

      isin:
        item?.isin ?? '-',

      issuerName:
        item?.issuer_name ?? '-',

      allotmentDate:
        item?.allotment_date
          ? new Date(item.allotment_date)
              .toISOString()
              .split('T')[0]
          : '-',

      couponRate:
        item?.coupon_rate ?? '-',

      debentureTrusteeName:
        item?.debenture_trustee_name ?? '-',

      registrarDetail:
        item?.registrar_detail ?? '-',

      maturityDate:
        item?.maturity_date
          ? new Date(item.maturity_date)
              .toISOString()
              .split('T')[0]
          : '-',

      rating:
        item?.rating ?? '-',

      arrangerName:
        item?.arranger_name ?? '-',

      securityName:
        item?.security_name ?? '-',

      securityType:
        item?.security_type ?? '-',

      modeIssue:
        item?.mode_issue ?? '-',

      issueSize:
        item?.issue_size ?? null,

      faceValue:
        item?.face_value ?? null,

      agencyName:
        item?.agency_name ?? '-',

      seniority:
        item?.seniority ?? '-',

      taxFree:
        item?.tax_free ?? '-',

      securedFlag:
        item?.secured_flag ?? '-',

      listingStatus:
        item?.listing_status ?? '-',

      issuerMasterId:
        item?.issuer_master_id ?? '-',
    }));

    // ============================================================
    // RESPONSE
    // ============================================================

    return res.json({
      success: true,

      // Existing count:
      // Number of individual baseQuery records
      totalRecords:
        Number(
          totalCount?.[0]?.total || 0
        ),

      // New count:
      // Number of unique issuer_name + allotment_date groups
      clubbedTotalRecords:
        Number(
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

    // Validation
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const parsedOffset = parseInt(offset, 10) || 0;

    if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit < 0)) {
      return res.status(400).json({ error: 'limit must be a non-negative integer' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    // Date calculations
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

    /* ---------------- HELPER: Build multi-value IN clause ---------------- */
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

    /* ---------------- DYNAMIC FILTER BUILDER (excludes trustee) ---------------- */
    const buildFilterConditions = (tableAlias = 'mi') => {
      const conditions = [];
      const params = [];

      if (rating) {
        const inClause = buildInClause('mir2.rating', rating);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (creditRatingAgency) {
        const inClause = buildInClause('ma2.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            JOIN master_agency ma2 ON ma2.id = mir2.agency_id
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (registrar) {
        const inClause = buildInClause('mr2.registrar_name', registrar, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_registrar ir2
            JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (seniority) {
        const inClause = buildInClause('mstc2.description', seniority);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = ${tableAlias}.seniority AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (taxFree) {
        const inClause = buildInClause('mtf2.description', taxFree);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_tax_free mtf2
            WHERE mtf2.code = ${tableAlias}.tax_free AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securedFlag) {
        const inClause = buildInClause('msf2.description', securedFlag);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_secured_flag msf2
            WHERE msf2.code = ${tableAlias}.secured_flag AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (sector) {
        const inClause = buildInClause('mbs2.description', sector);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_business_sector mbs2
            WHERE mbs2.code = ${tableAlias}.business_sector AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature) {
        const inClause = buildInClause('mitn2.description', nature);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType) {
        const inClause = buildInClause('miot2.description', ownershipType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (dealSize) {
        const inClause = buildInClause(`${tableAlias}.issue_size`, dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      if (listingStatus) {
        const inClause = buildInClause('mls2.description', listingStatus);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securityType) {
        const inClause = buildInClause('mst2.description', securityType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_security_type mst2
            WHERE mst2.code = ${tableAlias}.security_class AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (modeOfIssue) {
        const inClause = buildInClause('mmi2.description', modeOfIssue);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_mode_issue mmi2
            WHERE mmi2.code = ${tableAlias}.mode_issue AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (isin) {
        const inClause = buildInClause(`${tableAlias}.isin`, isin, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      return { conditions, params };
    };

    const {
      conditions: filterConditions,
      params: filterParams
    } = buildFilterConditions('mi');

    const filterSql = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : '';

    /* ---------------- TRUSTEE FILTER (context-dependent) ---------------- */
    const buildTrusteeDirectFilter = () => {
      if (!trustee) return { sql: '', params: [] };
      const inClause = buildInClause('mt.short_name', trustee, true);
      if (!inClause) return { sql: '', params: [] };
      return { sql: ` AND ${inClause.clause}`, params: inClause.params };
    };

    const buildTrusteeExistsFilter = () => {
      if (!trustee) return { sql: '', params: [] };
      const inClause = buildInClause('mt2.short_name', trustee, true);
      if (!inClause) return { sql: '', params: [] };
      return {
        sql: ` AND EXISTS (
          SELECT 1 FROM issuer_trustee it2
          JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
          WHERE it2.issuer_id = mi.isin_id AND ${inClause.clause}
        )`,
        params: inClause.params
      };
    };

    const { sql: trusteeDirectSql, params: trusteeDirectParams } = buildTrusteeDirectFilter();
    const { sql: trusteeExistsSql, params: trusteeExistsParams } = buildTrusteeExistsFilter();

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);
    const pyStart = formatDate(previousStartDate);
    const pyEnd = formatDate(previousEndDate);

    /* ---------------- TOTALS ---------------- */

    const totalIssueSizeRaw = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_trustee it
        ON it.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${trusteeExistsSql}
        ${filterSql}
    `,
      cyStart,
      cyEnd,
      ...trusteeExistsParams,
      ...filterParams
    );

    const totalIssueSizePrevYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_trustee it
        ON it.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${filterSql}
    `, pyStart, pyEnd, ...trusteeExistsParams, ...filterParams);

    const totalIssuesCountCurrYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_trustee it
        ON it.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${filterSql}
    `, cyStart, cyEnd, ...trusteeExistsParams, ...filterParams);

    const totalIssuesCountPrevYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_trustee it
        ON it.issuer_id = mi.isin_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${filterSql}
    `, pyStart, pyEnd, ...trusteeExistsParams, ...filterParams);

    // Safely extract totals with defaults
    const totalIssueSize = parseFloat(totalIssueSizeRaw[0]?.aggregate) || 0;
    const totalIssueSizePrevYear = parseFloat(totalIssueSizePrevYearRaw[0]?.aggregate) || 0;
    const totalIssuesCountCurrYear = parseInt(totalIssuesCountCurrYearRaw[0]?.aggregate, 10) || 0;
    const totalIssuesCountPrevYear = parseInt(totalIssuesCountPrevYearRaw[0]?.aggregate, 10) || 0;

    // Avoid division by zero in SQL by using safe denominators
    const safeTotalIssueSize = totalIssueSize > 0 ? totalIssueSize / 10000000 : 1;
    const safeTotalIssueSizePrevYear = totalIssueSizePrevYear > 0 ? totalIssueSizePrevYear / 10000000 : 1;
    const safeTotalIssuesCount = totalIssuesCountCurrYear > 0 ? totalIssuesCountCurrYear : 1;
    const safeTotalIssuesCountPrevYear = totalIssuesCountPrevYear > 0 ? totalIssuesCountPrevYear : 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const limitOffsetSql = parsedLimit !== null ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}` : '';

    let tableQuery = '';

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
        ROUND((t1.no_issues / ${safeTotalIssuesCount}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${safeTotalIssuesCountPrevYear}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN IFNULL(t2.no_issues, 0) = 0 THEN 
            CASE WHEN IFNULL(t1.no_issues, 0) = 0 THEN 0 ELSE 100 END
          ELSE ROUND(
            ((IFNULL(t1.no_issues, 0) - IFNULL(t2.no_issues, 0)) /
            IFNULL(t2.no_issues, 0)) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mt.id,
          mt.short_name AS trustee_name,
          COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${filterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${filterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    } else {
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
        ROUND((t1.issue_size / ${safeTotalIssueSize}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${safeTotalIssueSizePrevYear}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN IFNULL(t2.issue_size, 0) = 0 THEN 
            CASE WHEN IFNULL(t1.issue_size, 0) = 0 THEN 0 ELSE 100 END
          ELSE ROUND(
            ((IFNULL(t1.issue_size, 0) - IFNULL(t2.issue_size, 0)) /
            IFNULL(t2.issue_size, 0)) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mt.id,
          mt.short_name AS trustee_name,
          COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${filterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${filterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery,
      cyStart, cyEnd, ...trusteeDirectParams, ...filterParams,
      pyStart, pyEnd, ...trusteeDirectParams, ...filterParams
    );

    /*----total count for table pagination ---*/
    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) AS total
      FROM isin_re_issuance mi
      JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${filterSql}
    `,
      cyStart, cyEnd, ...trusteeDirectParams, ...filterParams
    );

    const totalRecords = parseInt(totalCountResult[0]?.total, 10) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedTrusteesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${filterSql}
      GROUP BY it.trustee_id, mt.id, mt.short_name
      LIMIT 10
    `
        : `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT it.trustee_id, mi.allotment_date, mi.issuer_master_id) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN issuer_trustee it ON it.issuer_id = mi.isin_id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${filterSql}
      GROUP BY it.trustee_id, mt.id, mt.short_name
      LIMIT 10
    `;

    const sectorQuery = `
      SELECT
        r.trustee_id AS id,
        r.trustee_name AS name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedTrusteesSubQuery}) r
      JOIN issuer_trustee it ON it.trustee_id = r.trustee_id
      JOIN isin_re_issuance mi ON mi.isin_id = it.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
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

    // Parameters: subquery dates + trusteeDirectParams + baseFilterParams, then outer dates + baseFilterParams
    const sectorData = await prisma.$queryRawUnsafe(sectorQuery,
      cyStart, cyEnd, ...trusteeDirectParams, ...filterParams,
      cyStart, cyEnd, ...filterParams
    );

    /* ---------------- RESPONSE FORMAT ---------------- */

    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.trustee_name ?? '-',
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
      previousDeals: Number(safeTotalIssuesCountPrevYear) || 0,
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
    console.error('Trustees data API error:', error);
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

    /* ---------------- HELPER: Build multi-value IN clause ---------------- */
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

    /* ---------------- DYNAMIC FILTER BUILDER ---------------- */
    const buildFilterConditions = (tableAlias = 'i') => {
      const conditions = [];
      const params = [];

      if (rating) {
        const inClause = buildInClause('mir2.rating', rating);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (creditRatingAgency) {
        const inClause = buildInClause('mag2.short_name', creditRatingAgency);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_rating mir2
            JOIN master_agency mag2 ON mag2.id = mir2.agency_id
            WHERE mir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (registrar) {
        const inClause = buildInClause('mr2.registrar_name', registrar, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_registrar ir2
            JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
            WHERE ir2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (seniority) {
        const inClause = buildInClause('mstc2.description', seniority);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code = ${tableAlias}.seniority AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (taxFree) {
        const inClause = buildInClause('mtf2.description', taxFree);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_tax_free mtf2
            WHERE mtf2.code = ${tableAlias}.tax_free AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securedFlag) {
        const inClause = buildInClause('msf2.description', securedFlag);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_secured_flag msf2
            WHERE msf2.code = ${tableAlias}.secured_flag AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (sector) {
        const inClause = buildInClause('mbs2.description', sector);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_business_sector mbs2
            WHERE mbs2.code = ${tableAlias}.business_sector AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (trustee) {
        const inClause = buildInClause('mt2.short_name', trustee, true);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM issuer_trustee it2
            JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
            WHERE it2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature) {
        const inClause = buildInClause('mitn2.description', nature);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2 ON mitn2.code = mi2.nature_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType) {
        const inClause = buildInClause('miot2.description', ownershipType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2 ON miot2.code = mi2.issuer_ownership_type
            WHERE mi2.id = ${tableAlias}.isin_id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (dealSize) {
        const inClause = buildInClause(`${tableAlias}.issue_size`, dealSize, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
      }

      if (listingStatus) {
        const inClause = buildInClause('mls2.description', listingStatus);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
            WHERE mise2.issuer_id = ${tableAlias}.id AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (securityType) {
        const inClause = buildInClause('mst2.description', securityType);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_security_type mst2
            WHERE mst2.code = ${tableAlias}.security_class AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (modeOfIssue) {
        const inClause = buildInClause('mmi2.description', modeOfIssue);
        if (inClause) {
          conditions.push(`EXISTS (
            SELECT 1 FROM master_mode_issue mmi2
            WHERE mmi2.code = ${tableAlias}.mode_issue AND ${inClause.clause}
          )`);
          params.push(...inClause.params);
        }
      }

      if (isin) {
        const inClause = buildInClause(`${tableAlias}.isin`, isin, true);
        if (inClause) {
          conditions.push(inClause.clause);
          params.push(...inClause.params);
        }
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

    /* ---------------- FILTERED TOTALS ---------------- */

    const totalRatingNoResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      JOIN isin_re_issuance i ON i.isin_id = master_issuer_rating.issuer_id
      JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      JOIN issuer_trustee ON issuer_trustee.issuer_id = i.isin_id
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
          (COUNT( master_issuer_rating.id) / ${safeTotalRatingNo}) * 100,
          2
        ) AS percentage,
        COUNT( master_issuer_rating.id) AS rating_no,
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
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
      ${filterSql}
      GROUP BY 
      master_issuer_rating.rating;
    `;

    const queryParams = [
      cyStart,
      cyEnd,
      ...filterParams
    ];

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery, ...queryParams);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.label || '-',
        percentage: totalRatingNo === 0 ? 0 : (Number(item?.percentage) || 0),
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.rating || '-'
      }
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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

    // Fix: Validate and sanitize limit/offset
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
    if (rating.length > 0) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select)
    if (listingStatus.length > 0) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2 
        LEFT JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status 
        WHERE mise2.issuer_id = mi.isin_id AND mls2.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (seniority.length > 0) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (securedFlag.length > 0) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (sector.length > 0) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Trustee (multi-select)
    if (trustee.length > 0) {
      const placeholders = trustee.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2 
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id 
        WHERE it2.issuer_id = mi.isin_id AND mt2.short_name IN (${placeholders})
      )`);
      params.push(...trustee);
    }

    // Nature (multi-select)
    if (nature.length > 0) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (ownershipType.length > 0) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select)
    if (creditRatingAgency.length > 0) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency ma2 ON ma2.id = mir2.agency_id 
        WHERE mir2.issuer_id = mi.isin_id AND ma2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select)
    if (securityType.length > 0) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (modeOfIssue.length > 0) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Registrar (single-select, LIKE filter)
    if (registrar) {
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
    // Main data query — no 1:N joins, only 1:1 lookups + scalar subqueries
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

        -- 1:N relationships via scalar subqueries (prevents row multiplication)
        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = mi.isin_id
        ) AS debenture_trustee,

        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = mi.isin_id
        ) AS Arranger,

        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = mi.isin_id
        ) AS Registrar,

        (
          SELECT GROUP_CONCAT(DISTINCT CONCAT(ma.short_name, ': ', mir.rating) SEPARATOR '; ')
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
        ) AS credit_rating_info,

        (
          SELECT mir.rating
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating,

        (
          SELECT ma.short_name
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating_agency,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status,

        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange mise
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status_code,

        (
          SELECT icd.coupon_rate
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = mi.isin_id
          ORDER BY icd.id
          LIMIT 1
        ) AS coupon_rate

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

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ─────────────────────
    // Count query — same joins and filters, no row multiplication
    // ─────────────────────
    const countQuery = `
      SELECT COUNT(mi.isin_id) AS total
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
        // FIX: Query selects isin_id, not id
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */
    const conditions = [];
    const params = [];

    // Base filters
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    // ── 1:N relationship filters (EXISTS = no row multiplication) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    // ── 1:1 lookup filters (safe to JOIN directly) ──
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (taxFree.length > 0) {
      const ph = taxFree.map(() => '?').join(', ');
      conditions.push(`mtf.description IN (${ph})`);
      params.push(...taxFree);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    if (trustee) {
      conditions.push(`mt.short_name LIKE ?`);
      params.push(`%${trustee}%`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT subquery
       - No 1:N LEFT JOINs (ratings, listing_status moved to EXISTS)
       - Direct aggregation with trustee join
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT( CONCAT(mi.isin_id, '-', it.trustee_id)) AS no_of_issue,
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
      LEFT JOIN master_issuer 
        ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = master_issuer.nature_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // ─── FIX: Merge SQL results with expected month list (includes empty months) ───
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
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Trustee Name filter (LIKE search, array support)
    if (trusteeName && (Array.isArray(trusteeName) ? trusteeName.length > 0 : trusteeName !== '')) {
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

    // Issuer Name filter (LIKE search, array support)
    if (issuerName && (Array.isArray(issuerName) ? issuerName.length > 0 : issuerName !== '')) {
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

    // ISIN filter (LIKE search, array support)
    if (isin && (Array.isArray(isin) ? isin.length > 0 : isin !== '')) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter (array support)
    if (rating && (Array.isArray(rating) ? rating.length > 0 : rating !== '')) {
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

    // Seniority filter (array support)
    if (seniority && (Array.isArray(seniority) ? seniority.length > 0 : seniority !== '')) {
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

    // Tax Free filter (array support)
    if (taxFree && (Array.isArray(taxFree) ? taxFree.length > 0 : taxFree !== '')) {
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

    // Secured Flag filter (array support)
    if (securedFlag && (Array.isArray(securedFlag) ? securedFlag.length > 0 : securedFlag !== '')) {
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

    // Credit Rating Agency filter (array support, LIKE search)
    if (creditRatingAgency && (Array.isArray(creditRatingAgency) ? creditRatingAgency.length > 0 : creditRatingAgency !== '')) {
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

    // Listing Status filter (array support)
    if (listingStatus && (Array.isArray(listingStatus) ? listingStatus.length > 0 : listingStatus !== '')) {
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

    // Security Type filter (array support)
    if (securityType && (Array.isArray(securityType) ? securityType.length > 0 : securityType !== '')) {
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

    // Mode of Issue filter (array support)
    if (modeOfIssue && (Array.isArray(modeOfIssue) ? modeOfIssue.length > 0 : modeOfIssue !== '')) {
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

    // Arranger filter (array support, LIKE search)
    if (arranger && (Array.isArray(arranger) ? arranger.length > 0 : arranger !== '')) {
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

    // Registrar filter (array support, LIKE search)
    if (registrar && (Array.isArray(registrar) ? registrar.length > 0 : registrar !== '')) {
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
    // DATA QUERY — scalar subqueries for 1:N relationships
    // =========================
    const dataQuery = `
      SELECT
        i.isin_id AS issuerId,
        i.isin,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(i.allotment_date) AS allotment_date,
        (SELECT coupon_rate FROM issuer_coupon_details WHERE issuer_id = i.isin_id LIMIT 1) AS coupon_rate,
        mt.short_name AS debenture_trustee_name,
        (SELECT mr.short_name FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = i.isin_id LIMIT 1) AS registrar_detail,
        ANY_VALUE(i.maturity_date) AS maturity_date,
        (SELECT GROUP_CONCAT(DISTINCT mir.rating) FROM master_issuer_rating mir WHERE mir.issuer_id = i.isin_id) AS rating,
        (SELECT GROUP_CONCAT(DISTINCT mag.short_name) FROM master_issuer_rating mir JOIN master_agency mag ON mag.id = mir.agency_id WHERE mir.issuer_id = i.isin_id) AS agency_name,
        (SELECT GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating)) FROM master_issuer_rating mir JOIN master_agency mag ON mag.id = mir.agency_id WHERE mir.issuer_id = i.isin_id) AS rating_info,
        (SELECT GROUP_CONCAT(DISTINCT ma.short_name) FROM issuer_arranger ia JOIN master_arranger ma ON ma.id = ia.arranger_id WHERE ia.issuer_id = i.isin_id) AS arranger_name,
        ANY_VALUE(i.security_name) AS security_name,
        ANY_VALUE(s.description) AS security_type,
        ANY_VALUE(mi.description) AS mode_issue,
        ANY_VALUE(i.issue_size) AS issue_size,
        ANY_VALUE(i.face_value) AS face_value,
        ANY_VALUE(mstc.description) AS seniority,
        ANY_VALUE(tf.description) AS tax_free,
        ANY_VALUE(msf.description) AS secured_flag,
        (SELECT description FROM master_issuer_stock_exchange mise LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = i.isin_id ORDER BY mise.listing_status LIMIT 1) AS listing_status,
        ANY_VALUE(i.issuer_master_id) AS issuer_master_id,
        it.trustee_id
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
      GROUP BY i.isin_id, it.trustee_id, mt.short_name, i.isin
      ORDER BY ANY_VALUE(id.issuer_name)
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — simplified, no 1:N joins
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.isin_id, it.trustee_id
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
        GROUP BY i.isin_id, it.trustee_id, mt.short_name, i.isin
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

    if (
      ownershipType &&
      (
        Array.isArray(ownershipType)
          ? ownershipType.length > 0
          : ownershipType !== ''
      )
    ) {
      const ownershipValue = Array.isArray(
        ownershipType
      )
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

    if (
      nature &&
      (
        Array.isArray(nature)
          ? nature.length > 0
          : nature !== ''
      )
    ) {
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

    if (
      sector &&
      (
        Array.isArray(sector)
          ? sector.length > 0
          : sector !== ''
      )
    ) {
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

    if (
      securityType &&
      (
        Array.isArray(securityType)
          ? securityType.length > 0
          : securityType !== ''
      )
    ) {
      const securityValue = Array.isArray(
        securityType
      )
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

    if (
      modeOfIssue &&
      (
        Array.isArray(modeOfIssue)
          ? modeOfIssue.length > 0
          : modeOfIssue !== ''
      )
    ) {
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

    if (
      creditRatingAgency &&
      (
        Array.isArray(creditRatingAgency)
          ? creditRatingAgency.length > 0
          : creditRatingAgency !== ''
      )
    ) {
      const agencyValue = Array.isArray(
        creditRatingAgency
      )
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

    if (
      rating &&
      (
        Array.isArray(rating)
          ? rating.length > 0
          : rating !== ''
      )
    ) {
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

    if (
      seniority &&
      (
        Array.isArray(seniority)
          ? seniority.length > 0
          : seniority !== ''
      )
    ) {
      const seniorityValue = Array.isArray(
        seniority
      )
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

    if (
      taxFree &&
      (
        Array.isArray(taxFree)
          ? taxFree.length > 0
          : taxFree !== ''
      )
    ) {
      const taxFreeValue = Array.isArray(
        taxFree
      )
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

    if (
      securedFlag &&
      (
        Array.isArray(securedFlag)
          ? securedFlag.length > 0
          : securedFlag !== ''
      )
    ) {
      const securedFlagValue = Array.isArray(
        securedFlag
      )
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

    if (
      listingStatus &&
      (
        Array.isArray(listingStatus)
          ? listingStatus.length > 0
          : listingStatus !== ''
      )
    ) {
      const listingValue = Array.isArray(
        listingStatus
      )
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

    if (
      registrar &&
      (
        Array.isArray(registrar)
          ? registrar.length > 0
          : registrar !== ''
      )
    ) {
      const registrarValue = Array.isArray(
        registrar
      )
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

    if (
      arranger &&
      (
        Array.isArray(arranger)
          ? arranger.length > 0
          : arranger !== ''
      )
    ) {
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

    if (
      isin &&
      (
        Array.isArray(isin)
          ? isin.length > 0
          : isin !== ''
      )
    ) {
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

    if (
      issuerName &&
      (
        Array.isArray(issuerName)
          ? issuerName.length > 0
          : issuerName !== ''
      )
    ) {
      const issuerNameValue = Array.isArray(
        issuerName
      )
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
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    // Validate and parse limit/offset
    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const parsedOffset = parseInt(offset, 10) || 0;

    if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit < 0)) {
      return res.status(400).json({ error: 'limit must be a non-negative integer' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
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

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const sqlCurrentStart = formatDate(currentStartDate);
    const sqlCurrentEnd = formatDate(currentEndDate);
    const sqlPreviousStart = formatDate(previousStartDate);
    const sqlPreviousEnd = formatDate(previousEndDate);

    /* ---------------- FILTER HELPERS (parameterized) ---------------- */

    const buildFilterConditions = () => {
      const conditions = [];
      const params = [];

      if (rating.length > 0) {
        const placeholders = rating.map(() => '?').join(', ');
        conditions.push(`mir.rating IN (${placeholders})`);
        params.push(...rating);
      }

      if (listingStatus.length > 0) {
        const placeholders = listingStatus.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${placeholders})
        )`);
        params.push(...listingStatus);
      }

      if (seniority.length > 0) {
        const placeholders = seniority.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = mi.seniority AND mstc.description IN (${placeholders}))`);
        params.push(...seniority);
      }

      if (securedFlag.length > 0) {
        const placeholders = securedFlag.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = mi.secured_flag AND msf.description IN (${placeholders}))`);
        params.push(...securedFlag);
      }

      if (sector.length > 0) {
        const placeholders = sector.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = mi.business_sector AND mbs.description IN (${placeholders}))`);
        params.push(...sector);
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature.length > 0) {
        const placeholders = nature.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_type_nature mitn ON mitn.code = mi2.nature_type
          WHERE mi2.id = mi.isin_id AND mitn.description IN (${placeholders})
        )`);
        params.push(...nature);
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType.length > 0) {
        const placeholders = ownershipType.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_ownership_type miot ON miot.code = mi2.issuer_ownership_type
          WHERE mi2.id = mi.isin_id AND miot.description IN (${placeholders})
        )`);
        params.push(...ownershipType);
      }

      if (creditRatingAgency.length > 0) {
        const placeholders = creditRatingAgency.map(() => '?').join(', ');
        conditions.push(`ma.short_name IN (${placeholders})`);
        params.push(...creditRatingAgency);
      }

      if (securityType.length > 0) {
        const placeholders = securityType.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = mi.security_class AND mst.description IN (${placeholders}))`);
        params.push(...securityType);
      }

      if (modeOfIssue.length > 0) {
        const placeholders = modeOfIssue.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = mi.mode_issue AND mmi.description IN (${placeholders}))`);
        params.push(...modeOfIssue);
      }

      if (isin) {
        conditions.push(`mi.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      if (registrar.length > 0) {
        const placeholders = registrar.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = mi.isin_id AND mr.registrar_name IN (${placeholders})
        )`);
        params.push(...registrar);
      }

      return { conditions, params };
    };

    const { conditions: filterConditions, params: filterParams } = buildFilterConditions();
    const filterSql = filterConditions.length > 0 ? ' AND ' + filterConditions.join(' AND ') : '';

    /* ---------------- TOTALS (parameterized, no Cartesian product) ---------------- */

    const totalIssueSizeResult = await prisma.$queryRawUnsafe(`
        SELECT COALESCE(SUM(mi.issue_size),0) AS aggregate
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma
            ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalIssueSizePrevYearResult = await prisma.$queryRawUnsafe(`
        SELECT COALESCE(SUM(mi.issue_size),0) AS aggregate
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma
            ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
    `, sqlPreviousStart, sqlPreviousEnd, ...filterParams);

    const totalIssuesCountCurrYearResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT( mi.isin) AS aggregate
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma
            ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalIssuesCountPrevYearResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(mi.isin) AS aggregate
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma
            ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${filterSql}
    `, sqlPreviousStart, sqlPreviousEnd, ...filterParams);

    // Safely extract totals
    const totalIssueSize = parseFloat(totalIssueSizeResult[0]?.aggregate) || 0;
    const totalIssueSizePrevYear = parseFloat(totalIssueSizePrevYearResult[0]?.aggregate) || 0;
    const totalIssuesCountCurrYear = parseInt(totalIssuesCountCurrYearResult[0]?.aggregate, 10) || 0;
    const totalIssuesCountPrevYear = parseInt(totalIssuesCountPrevYearResult[0]?.aggregate, 10) || 0;

    const safeTotalIssueSize = totalIssueSize > 0 ? totalIssueSize / 10000000 : 1;
    const safeTotalIssueSizePrevYear = totalIssueSizePrevYear > 0 ? totalIssueSizePrevYear / 10000000 : 1;
    const safeTotalIssuesCount = totalIssuesCountCurrYear > 0 ? totalIssuesCountCurrYear : 1;
    const safeTotalIssuesCountPrevYear = totalIssuesCountPrevYear > 0 ? totalIssuesCountPrevYear : 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const limitOffsetSql = parsedLimit !== null ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}` : '';

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
        ROUND((t1.no_issues / ${safeTotalIssuesCount}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${safeTotalIssuesCountPrevYear}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN IFNULL(t2.no_issues, 0) = 0 THEN
            CASE WHEN IFNULL(t1.no_issues, 0) = 0 THEN 0 ELSE 100 END
          ELSE ROUND(
            ((IFNULL(t1.no_issues, 0) - IFNULL(t2.no_issues, 0)) /
            IFNULL(t2.no_issues, 0)) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          ma.id,
          ma.short_name AS agency_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
                ORDER BY
                    COUNT(mi.isin) DESC,
                    ROUND(SUM(mi.issue_size) / 10000000, 2) DESC
            ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_details ON issuer_details.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${filterSql}
        GROUP BY ma.id, ma.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
              ORDER BY
                  COUNT(mi.isin) DESC,
                  ROUND(SUM(mi.issue_size) / 10000000, 2) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN issuer_details ON issuer_details.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${filterSql}
        GROUP BY ma.id, ma.short_name
      ) t2 ON t1.id = t2.id
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
        ROUND((t1.issue_size / ${safeTotalIssueSize}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${safeTotalIssueSizePrevYear}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN IFNULL(t2.issue_size, 0) = 0 THEN
            CASE WHEN IFNULL(t1.issue_size, 0) = 0 THEN 0 ELSE 100 END
          ELSE ROUND(
            ((IFNULL(t1.issue_size, 0) - IFNULL(t2.issue_size, 0)) /
            IFNULL(t2.issue_size, 0)) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          ma.id,
          ma.short_name AS agency_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
              ORDER BY
                  ROUND(SUM(issue_size) / 10000000, 2) DESC,
                  COUNT(isin) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${filterSql}
        GROUP BY ma.id, ma.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
              ORDER BY
                  ROUND(SUM(issue_size) / 10000000, 2) DESC,
                  COUNT(isin) DESC
          ) AS arr_rank
        FROM isin_re_issuance mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${filterSql}
        GROUP BY ma.id, ma.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery,
      sqlCurrentStart, sqlCurrentEnd, ...filterParams,
      sqlPreviousStart, sqlPreviousEnd, ...filterParams
    );

    /* ---------------- TOTAL COUNT ---------------- */

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(mi.isin) AS total
      FROM isin_re_issuance mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalRecords = Number(totalCountResult[0]?.total) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedAgenciesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        ma.id AS agency_id,
        ma.short_name AS agency_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
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
          ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.isin_id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
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
      JOIN master_issuer_rating mir ON mir.agency_id = r.agency_id
      JOIN isin_re_issuance mi ON mi.isin_id = mir.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
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
      sqlCurrentStart, sqlCurrentEnd, ...filterParams,  // for the subquery
      sqlCurrentStart, sqlCurrentEnd                    // for the outer query
    );

    /* ---------------- RESPONSE FORMAT ---------------- */

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
      previousDeals: Number(safeTotalIssuesCountPrevYear) || 0,
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
    console.error('Rating agencies top data API error:', error);
    res.status(500).json({
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

    /* ---------------- FILTER BUILDERS (parameterized) ---------------- */

    const buildFilterConditions = (issuerAlias = 'i') => {
      const conditions = [];
      const params = [];

      if (rating.length > 0) {
        const placeholders = rating.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir_sub WHERE mir_sub.issuer_id = ${issuerAlias}.id AND mir_sub.rating IN (${placeholders}))`);
        params.push(...rating);
      }

      if (listingStatus.length > 0) {
        const placeholders = listingStatus.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = ${issuerAlias}.id AND mls.description IN (${placeholders})
        )`);
        params.push(...listingStatus);
      }

      if (seniority.length > 0) {
        const placeholders = seniority.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = ${issuerAlias}.seniority AND mstc.description IN (${placeholders}))`);
        params.push(...seniority);
      }

      if (securedFlag.length > 0) {
        const placeholders = securedFlag.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = ${issuerAlias}.secured_flag AND msf.description IN (${placeholders}))`);
        params.push(...securedFlag);
      }

      if (sector.length > 0) {
        const placeholders = sector.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = ${issuerAlias}.business_sector AND mbs.description IN (${placeholders}))`);
        params.push(...sector);
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (nature.length > 0) {
        const placeholders = nature.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_type_nature mitn ON mitn.code = mi2.nature_type
          WHERE mi2.id = ${issuerAlias}.isin_id AND mitn.description IN (${placeholders})
        )`);
        params.push(...nature);
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (ownershipType.length > 0) {
        const placeholders = ownershipType.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer mi2
          JOIN master_issuer_ownership_type miot ON miot.code = mi2.issuer_ownership_type
          WHERE mi2.id = ${issuerAlias}.isin_id AND miot.description IN (${placeholders})
        )`);
        params.push(...ownershipType);
      }

      if (creditRatingAgency.length > 0) {
        const placeholders = creditRatingAgency.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir_sub2 JOIN master_agency ma_sub ON ma_sub.id = mir_sub2.agency_id WHERE mir_sub2.issuer_id = ${issuerAlias}.id AND ma_sub.short_name IN (${placeholders}))`);
        params.push(...creditRatingAgency);
      }

      if (securityType.length > 0) {
        const placeholders = securityType.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = ${issuerAlias}.security_class AND mst.description IN (${placeholders}))`);
        params.push(...securityType);
      }

      if (modeOfIssue.length > 0) {
        const placeholders = modeOfIssue.map(() => '?').join(', ');
        conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = ${issuerAlias}.mode_issue AND mmi.description IN (${placeholders}))`);
        params.push(...modeOfIssue);
      }

      if (isin) {
        conditions.push(`${issuerAlias}.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      if (registrar.length > 0) {
        const placeholders = registrar.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = ${issuerAlias}.id AND mr.registrar_name IN (${placeholders})
        )`);
        params.push(...registrar);
      }

      return { conditions, params };
    };

    const { conditions: filterConditions, params: filterParams } = buildFilterConditions('i');
    const filterSql = filterConditions.length > 0 ? ' AND ' + filterConditions.join(' AND ') : '';

    /* ---------------- TOTALS (parameterized, scoped by id if provided) ---------------- */

    const idFilterSql = isIdValid ? ` AND master_agency.id = ?` : '';
    const idFilterParams = isIdValid ? [parsedId] : [];

    const totalRatingNoResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer_rating mir
      INNER JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
      LEFT JOIN master_agency ON master_agency.id = mir.agency_id
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
        INNER JOIN master_issuer_rating mir ON mir.agency_id = master_agency.id
        LEFT JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          ${filterSql}
          AND master_agency.id = ?
        GROUP BY mir.rating
      `;
      queryParams = [sqlStartDate, sqlEndDate, ...filterParams, parsedId];
    } else {
      // Overview: one row per agency with modal rating
      creditRatingQuery = `
        SELECT
          MAX(master_agency.short_name) AS label,
          ROUND((COUNT(mir.rating) / ${safeTotalRatingNo}) * 100, 2) AS percentage,
          COUNT(mir.id) AS rating_no,
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'), -6)) AS color,
          mir.rating
        FROM master_agency
        INNER JOIN master_issuer_rating mir ON mir.agency_id = master_agency.id
        LEFT JOIN isin_re_issuance i ON i.isin_id = mir.issuer_id
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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

    // Fix: Validate and sanitize limit/offset
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
    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    // ISIN (single-select, LIKE filter)
    if (isin) {
      conditions.push(`mi.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    // Rating (multi-select, 1:N)
    if (rating.length > 0) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select, 1:N)
    if (listingStatus.length > 0) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise 
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status 
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select, 1:1 via join)
    if (seniority.length > 0) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select, 1:1 via join)
    if (securedFlag.length > 0) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select, 1:1 via join)
    if (sector.length > 0) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Nature (multi-select, 1:1 via join)
    if (nature.length > 0) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select, 1:1 via join)
    if (ownershipType.length > 0) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select, 1:N)
    if (creditRatingAgency.length > 0) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency ma2 ON ma2.id = mir2.agency_id 
        WHERE mir2.issuer_id = mi.isin_id AND ma2.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select, 1:1 via join)
    if (securityType.length > 0) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select, 1:1 via join)
    if (modeOfIssue.length > 0) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Arranger (single-select, LIKE, 1:N)
    if (arranger) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia 
        JOIN master_arranger ma ON ma.id = ia.arranger_id 
        WHERE ia.issuer_id = mi.isin_id AND ma.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    // Registrar (single-select, LIKE, 1:N)
    if (registrar) {
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
    // Main data query — no 1:N joins, only 1:1 lookups + scalar subqueries
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

        -- 1:N relationships via scalar subqueries (prevents row multiplication)
        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = mi.isin_id
        ) AS debenture_trustee,

        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = mi.isin_id
        ) AS Arranger,

        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = mi.isin_id
        ) AS Registrar,

        (
          SELECT GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ')
          FROM master_issuer_rating mir
          JOIN master_agency mag ON mag.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
        ) AS credit_rating_info,

        (
          SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
          FROM master_issuer_rating mir
          WHERE mir.issuer_id = mi.isin_id
        ) AS credit_rating,

        (
          SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
          FROM master_issuer_rating mir
          JOIN master_agency mag ON mag.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
        ) AS credit_rating_agency,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status,

        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange mise
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status_code,

        (
          SELECT icd.coupon_rate
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = mi.isin_id
          ORDER BY icd.id
          LIMIT 1
        ) AS coupon_rate

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

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ─────────────────────
    // Count query — same joins and filters, no row multiplication
    // ─────────────────────
    const countQuery = `
      SELECT COUNT(mi.isin_id) AS total
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
        // FIX: Query selects isin_id, not id
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */
    const conditions = [];
    const params = [];

    // Base filters
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    // ── 1:N relationship filters (EXISTS = no row multiplication) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    // ── 1:1 lookup filters (safe to JOIN directly) ──
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (taxFree.length > 0) {
      const ph = taxFree.map(() => '?').join(', ');
      conditions.push(`mtf.description IN (${ph})`);
      params.push(...taxFree);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT subquery
       - No 1:N LEFT JOINs (ratings, listing_status moved to EXISTS)
       - Direct aggregation with agency join
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.isin_id, '-', mir.agency_id)) AS no_of_issue,
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
      LEFT JOIN master_issuer 
        ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = master_issuer.nature_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // ─── FIX: Merge SQL results with expected month list (includes empty months) ───
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
    conditions.push(`i.allotment_date BETWEEN ? AND ? AND i.is_visible = 1`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (safeMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(safeMonth);
    }

    // Issuer Name filter (LIKE search, array support)
    if (issuerName && (Array.isArray(issuerName) ? issuerName.length > 0 : issuerName !== '')) {
      const issuerNameValue = Array.isArray(issuerName) ? issuerName : [issuerName];
      const inClause = buildInClause('id.issuer_name', issuerNameValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // ISIN filter (LIKE search, array support)
    if (isin && (Array.isArray(isin) ? isin.length > 0 : isin !== '')) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter (array support)
    if (rating && (Array.isArray(rating) ? rating.length > 0 : rating !== '')) {
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

    // Seniority filter (array support)
    if (seniority && (Array.isArray(seniority) ? seniority.length > 0 : seniority !== '')) {
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

    // Tax Free filter (array support)
    if (taxFree && (Array.isArray(taxFree) ? taxFree.length > 0 : taxFree !== '')) {
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

    // Secured Flag filter (array support)
    if (securedFlag && (Array.isArray(securedFlag) ? securedFlag.length > 0 : securedFlag !== '')) {
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

    // Credit Rating Agency filter (array support, LIKE search)
    if (creditRatingAgency && (Array.isArray(creditRatingAgency) ? creditRatingAgency.length > 0 : creditRatingAgency !== '')) {
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

    // Listing Status filter (array support)
    if (listingStatus && (Array.isArray(listingStatus) ? listingStatus.length > 0 : listingStatus !== '')) {
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

    // Security Type filter (array support)
    if (securityType && (Array.isArray(securityType) ? securityType.length > 0 : securityType !== '')) {
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

    // Mode of Issue filter (array support)
    if (modeOfIssue && (Array.isArray(modeOfIssue) ? modeOfIssue.length > 0 : modeOfIssue !== '')) {
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

    // Arranger filter (array support, LIKE search)
    if (arranger && (Array.isArray(arranger) ? arranger.length > 0 : arranger !== '')) {
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

    // Debenture Trustee filter (array support, LIKE search)
    if (debentureTrustee && (Array.isArray(debentureTrustee) ? debentureTrustee.length > 0 : debentureTrustee !== '')) {
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

    // Registrar filter (array support, LIKE search)
    if (registrar && (Array.isArray(registrar) ? registrar.length > 0 : registrar !== '')) {
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
    // DATA QUERY — scalar subqueries for 1:N relationships
    // =========================
    const dataQuery = `
      SELECT
        i.isin_id AS issuerId,
        i.isin,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(i.allotment_date) AS allotment_date,
        (SELECT coupon_rate FROM issuer_coupon_details WHERE issuer_id = i.isin_id LIMIT 1) AS coupon_rate,
        mag.short_name AS agency_name,
        (SELECT mt.short_name FROM issuer_trustee it JOIN master_trustee mt ON mt.id = it.trustee_id WHERE it.issuer_id = i.isin_id LIMIT 1) AS debenture_trustee_name,
        (SELECT mr.short_name FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = i.isin_id LIMIT 1) AS registrar_detail,
        ANY_VALUE(i.maturity_date) AS maturity_date,
        ANY_VALUE(mir.rating) AS rating_value,
        (SELECT GROUP_CONCAT(DISTINCT ma.short_name) FROM issuer_arranger ia JOIN master_arranger ma ON ma.id = ia.arranger_id WHERE ia.issuer_id = i.isin_id) AS arranger_name,
        ANY_VALUE(i.security_name) AS security_name,
        ANY_VALUE(s.description) AS security_type,
        ANY_VALUE(mi.description) AS mode_issue,
        ANY_VALUE(i.issue_size) AS issue_size,
        ANY_VALUE(i.face_value) AS face_value,
        ANY_VALUE(mstc.description) AS seniority,
        ANY_VALUE(tf.description) AS tax_free,
        ANY_VALUE(msf.description) AS secured_flag,
        (SELECT description FROM master_issuer_stock_exchange mise LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = i.isin_id ORDER BY mise.listing_status LIMIT 1) AS listing_status,
        ANY_VALUE(i.issuer_master_id) AS issuer_master_id
      FROM isin_re_issuance i
      INNER JOIN master_issuer_rating mir ON i.isin_id = mir.issuer_id
      INNER JOIN master_agency mag ON mag.id = mir.agency_id
      LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
      LEFT JOIN master_security_type s ON s.code = i.security_class
      LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
      ${whereClause}
      GROUP BY i.isin_id, mir.agency_id, mag.short_name, i.isin
      ORDER BY ANY_VALUE(id.issuer_name)
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — simplified, no 1:N joins
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.isin_id, mir.agency_id
        FROM isin_re_issuance i
        INNER JOIN master_issuer_rating mir ON i.isin_id = mir.issuer_id
        INNER JOIN master_agency mag ON mag.id = mir.agency_id
        LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
        LEFT JOIN master_security_type s ON s.code = i.security_class
        LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
        LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.isin_id, mir.agency_id, mag.short_name, i.isin
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
    const total = Number(countResult?.[0]?.total) || 0;

    // =========================
    // DATA FORMATTING
    // =========================
    const formattedData = result.map((item) => ({
      issuerId: item?.issuerId || '-',
      issuerName: item?.issuer_name || '-',
      isin: item?.isin || '-',
      securityName: item?.security_name || '-',
      securityType: item?.security_type || '-',
      modeOfIssue: item?.mode_issue || '-',
      allotmentDate: item?.allotment_date || '-',
      maturityDate: item?.maturity_date || '-',
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
    }));

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
        message:
          'startDate, endDate and agencyId are required',
      });
    }

    const parsedAgencyId = parseInt(agencyId, 10);

    if (
      isNaN(parsedAgencyId) ||
      parsedAgencyId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'agencyId must be a positive integer',
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
        message:
          'startDate must be before or equal to endDate',
      });
    }

    // =========================================================
    // LIMIT / OFFSET
    // =========================================================

    const safeLimit = Math.max(
      1,
      Math.min(
        1000,
        Number(limit) || 25
      )
    );

    const safeOffset = Math.max(
      0,
      Number(offset) || 0
    );

    // =========================================================
    // DATE FORMATTER
    // =========================================================

    const formatDateTime = (
      dateStr,
      isEnd = false
    ) => {
      const date = new Date(dateStr);

      if (isNaN(date.getTime())) {
        return null;
      }

      if (isEnd) {
        date.setHours(
          23,
          59,
          59,
          0
        );
      } else {
        date.setHours(
          0,
          0,
          0,
          0
        );
      }

      return date
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const sqlStartDate =
      formatDateTime(
        startDate,
        false
      );

    const sqlEndDate =
      formatDateTime(
        endDate,
        true
      );

    if (
      !sqlStartDate ||
      !sqlEndDate
    ) {
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

    const orderBy =
      validSortFields.includes(sortField)
        ? sortField
        : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // =========================================================
    // SEARCH CONFIGURATION
    // =========================================================

    const safeSearchQuery =
      SearchQuery?.trim() || '';

    const escapeLike = (str) =>
      str.replace(
        /[%_\\]/g,
        '\\$&'
      );

    const searchPattern =
      safeSearchQuery
        ? `%${escapeLike(
            safeSearchQuery
          )}%`
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
        (
          Array.isArray(values) &&
          values.length === 0
        )
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
          .map(
            () => `${field} LIKE ?`
          )
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

    conditions.push(
      `mir.agency_id = ?`
    );

    params.push(
      parsedAgencyId
    );

    conditions.push(
      `i.allotment_date BETWEEN ? AND ?`
    );

    params.push(
      sqlStartDate,
      sqlEndDate
    );

    conditions.push(
      `i.is_visible = 1`
    );

    // =========================================================
    // OWNERSHIP TYPE
    // =========================================================

    if (
      ownershipType &&
      (
        Array.isArray(ownershipType)
          ? ownershipType.length > 0
          : ownershipType !== ''
      )
    ) {
      const ownershipValue =
        Array.isArray(ownershipType)
          ? ownershipType
          : [ownershipType];

      const inClause =
        buildInClause(
          'miot2.description',
          ownershipValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_ownership_type miot2
              ON miot2.code =
                 mi2.issuer_ownership_type
            WHERE mi2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // NATURE
    // =========================================================

    if (
      nature &&
      (
        Array.isArray(nature)
          ? nature.length > 0
          : nature !== ''
      )
    ) {
      const natureValue =
        Array.isArray(nature)
          ? nature
          : [nature];

      const inClause =
        buildInClause(
          'mitn2.description',
          natureValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer mi2
            JOIN master_issuer_type_nature mitn2
              ON mitn2.code =
                 mi2.nature_type
            WHERE mi2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // SECTOR
    // =========================================================

    if (
      sector &&
      (
        Array.isArray(sector)
          ? sector.length > 0
          : sector !== ''
      )
    ) {
      const sectorValue =
        Array.isArray(sector)
          ? sector
          : [sector];

      const inClause =
        buildInClause(
          'mbs2.description',
          sectorValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_business_sector mbs2
            WHERE mbs2.code =
                  i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // SECURITY TYPE
    // =========================================================

    if (
      securityType &&
      (
        Array.isArray(securityType)
          ? securityType.length > 0
          : securityType !== ''
      )
    ) {
      const securityValue =
        Array.isArray(securityType)
          ? securityType
          : [securityType];

      const inClause =
        buildInClause(
          'mst2.description',
          securityValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_security_type mst2
            WHERE mst2.code =
                  i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // MODE OF ISSUE
    // =========================================================

    if (
      modeOfIssue &&
      (
        Array.isArray(modeOfIssue)
          ? modeOfIssue.length > 0
          : modeOfIssue !== ''
      )
    ) {
      const modeValue =
        Array.isArray(modeOfIssue)
          ? modeOfIssue
          : [modeOfIssue];

      const inClause =
        buildInClause(
          'mmi2.description',
          modeValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_mode_issue mmi2
            WHERE mmi2.code =
                  i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // CREDIT RATING AGENCY
    // =========================================================

    if (
      creditRatingAgency &&
      (
        Array.isArray(
          creditRatingAgency
        )
          ? creditRatingAgency.length > 0
          : creditRatingAgency !== ''
      )
    ) {
      const agencyValue =
        Array.isArray(
          creditRatingAgency
        )
          ? creditRatingAgency
          : [creditRatingAgency];

      const inClause =
        buildInClause(
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
              ON mag2.id =
                 mir2.agency_id
            WHERE mir2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // RATING
    // =========================================================

    if (
      rating &&
      (
        Array.isArray(rating)
          ? rating.length > 0
          : rating !== ''
      )
    ) {
      const ratingValue =
        Array.isArray(rating)
          ? rating
          : [rating];

      const inClause =
        buildInClause(
          'mir2.rating',
          ratingValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_rating mir2
            WHERE mir2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // SENIORITY
    // =========================================================

    if (
      seniority &&
      (
        Array.isArray(seniority)
          ? seniority.length > 0
          : seniority !== ''
      )
    ) {
      const seniorityValue =
        Array.isArray(seniority)
          ? seniority
          : [seniority];

      const inClause =
        buildInClause(
          'mstc2.description',
          seniorityValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_seniority_tier_classification mstc2
            WHERE mstc2.code =
                  i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // TAX FREE
    // =========================================================

    if (
      taxFree &&
      (
        Array.isArray(taxFree)
          ? taxFree.length > 0
          : taxFree !== ''
      )
    ) {
      const taxFreeValue =
        Array.isArray(taxFree)
          ? taxFree
          : [taxFree];

      const inClause =
        buildInClause(
          'mtf2.description',
          taxFreeValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_tax_free mtf2
            WHERE mtf2.code =
                  i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // SECURED FLAG
    // =========================================================

    if (
      securedFlag &&
      (
        Array.isArray(securedFlag)
          ? securedFlag.length > 0
          : securedFlag !== ''
      )
    ) {
      const securedFlagValue =
        Array.isArray(securedFlag)
          ? securedFlag
          : [securedFlag];

      const inClause =
        buildInClause(
          'msf2.description',
          securedFlagValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_secured_flag msf2
            WHERE msf2.code =
                  i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // LISTING STATUS
    // =========================================================

    if (
      listingStatus &&
      (
        Array.isArray(listingStatus)
          ? listingStatus.length > 0
          : listingStatus !== ''
      )
    ) {
      const listingValue =
        Array.isArray(listingStatus)
          ? listingStatus
          : [listingStatus];

      const inClause =
        buildInClause(
          'mls2.description',
          listingValue
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM master_issuer_stock_exchange mise2
            JOIN master_listing_status mls2
              ON mls2.code =
                 mise2.listing_status
            WHERE mise2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // REGISTRAR
    // =========================================================

    if (
      registrar &&
      (
        Array.isArray(registrar)
          ? registrar.length > 0
          : registrar !== ''
      )
    ) {
      const registrarValue =
        Array.isArray(registrar)
          ? registrar
          : [registrar];

      const inClause =
        buildInClause(
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
              ON mr2.id =
                 ir2.registrar_id
            WHERE ir2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // TRUSTEE
    // =========================================================

    if (
      trustee &&
      (
        Array.isArray(trustee)
          ? trustee.length > 0
          : trustee !== ''
      )
    ) {
      const trusteeValue =
        Array.isArray(trustee)
          ? trustee
          : [trustee];

      const inClause =
        buildInClause(
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
              ON mt2.id =
                 it2.trustee_id
            WHERE it2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // ISIN
    // =========================================================

    if (
      isin &&
      (
        Array.isArray(isin)
          ? isin.length > 0
          : isin !== ''
      )
    ) {
      const isinValue =
        Array.isArray(isin)
          ? isin
          : [isin];

      const inClause =
        buildInClause(
          'i.isin',
          isinValue,
          true
        );

      if (inClause) {
        conditions.push(
          inClause.clause
        );

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // ISSUER NAME
    // =========================================================

    if (
      issuerName &&
      (
        Array.isArray(issuerName)
          ? issuerName.length > 0
          : issuerName !== ''
      )
    ) {
      const issuerNameValue =
        Array.isArray(issuerName)
          ? issuerName
          : [issuerName];

      const inClause =
        buildInClause(
          'id2.issuer_name',
          issuerNameValue,
          true
        );

      if (inClause) {
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM issuer_details id2
            WHERE id2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // =========================================================
    // ARRANGER
    // =========================================================

    if (
      arranger &&
      (
        Array.isArray(arranger)
          ? arranger.length > 0
          : arranger !== ''
      )
    ) {
      const arrangerValue =
        Array.isArray(arranger)
          ? arranger
          : [arranger];

      const inClause =
        buildInClause(
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
              ON ma2.id =
                 ia2.arranger_id
            WHERE ia2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    const whereClause =
      conditions.join(' AND ');

    // =========================================================
    // BASE QUERY
    // =========================================================
    //
    // This is the common filtered dataset.
    // Both totalRecords and clubbedTotalRecords
    // are calculated from this query.
    //
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
          WHERE icd.issuer_id =
                i.isin_id
        ) AS coupon_rate,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mt.short_name
            SEPARATOR ', '
          )
          FROM issuer_trustee it
          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id
          WHERE it.issuer_id =
                i.isin_id
        ) AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mr.registrar_name
            SEPARATOR ', '
          )
          FROM issuer_registrar ir
          JOIN master_registrar mr
            ON mr.id =
               ir.registrar_id
          WHERE ir.issuer_id =
                i.isin_id
        ) AS registrar_detail,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mir.rating
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          WHERE mir.issuer_id =
                i.isin_id
        ) AS rating,

        (
          SELECT GROUP_CONCAT(
            DISTINCT ma.short_name
            SEPARATOR ', '
          )
          FROM issuer_arranger ia
          JOIN master_arranger ma
            ON ma.id =
               ia.arranger_id
          WHERE ia.issuer_id =
                i.isin_id
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
            ON mls.code =
               mise.listing_status
          WHERE mise.issuer_id =
                i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM isin_re_issuance i

      INNER JOIN master_issuer_rating mir
        ON i.isin_id =
           mir.issuer_id

      INNER JOIN master_agency mag
        ON mir.agency_id =
           mag.id

      LEFT JOIN issuer_details id
        ON i.issuer_master_id =
           id.id

      LEFT JOIN master_security_type s
        ON i.security_class =
           s.code

      LEFT JOIN master_mode_issue mi
        ON i.mode_issue =
           mi.code

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code =
           i.seniority

      LEFT JOIN master_tax_free tf
        ON tf.code =
           i.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code =
           i.secured_flag

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

    const dataParams = [
      ...params,
    ];

    if (searchPattern) {
      dataQuery += searchClause;

      dataParams.push(
        ...searchParams
      );
    }

    dataQuery += `
      ORDER BY
        ${orderBy}
        ${orderDirection}
      LIMIT ?
      OFFSET ?
    `;

    dataParams.push(
      safeLimit,
      safeOffset
    );

    // =========================================================
    // NORMAL COUNT QUERY
    // =========================================================
    //
    // Counts the actual rows produced
    // by baseQuery after SearchQuery.
    //
    // =========================================================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
      WHERE 1 = 1
    `;

    const countParams = [
      ...params,
    ];

    if (searchPattern) {
      countQuery += searchClause;

      countParams.push(
        ...searchParams
      );
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

    const clubbedCountParams = [
      ...params,
    ];

    if (searchPattern) {
      clubbedCountQuery += searchClause;

      clubbedCountParams.push(
        ...searchParams
      );
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

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.json({
      success: true,

      // Existing count:
      // individual filtered rows
      totalRecords: Number(
        totalCount[0]?.total || 0
      ),

      // New count:
      // unique issuer + allotment date
      clubbedTotalRecords: Number(
        clubbedCount[0]?.clubbedTotal || 0
      ),

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

    // Format dates for MySQL (YYYY-MM-DD HH:MM:SS) — use local time to avoid UTC shift
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

    /* ─────────────── COMMON FILTER BUILDER (excludes registrar) ─────────────── */
    const buildCommonFilters = (alias) => {
      const joins = [];
      const conditions = [];
      const params = [];

      if (listingStatus.length > 0) {
        const placeholders = listingStatus.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = ${alias}.id AND mls.description IN (${placeholders})
        )`);
        params.push(...listingStatus);
      }

      if (creditRating.length > 0) {
        const placeholders = creditRating.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir
          WHERE mir.issuer_id = ${alias}.id AND mir.rating IN (${placeholders})
        )`);
        params.push(...creditRating);
      }

      if (creditRatingAgency.length > 0) {
        const placeholders = creditRatingAgency.map(() => '?').join(', ');
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir
          WHERE mir.issuer_id = ${alias}.id AND mir.rating_agency IN (${placeholders})
        )`);
        params.push(...creditRatingAgency);
      }

      if (seniority.length > 0) {
        joins.push(`LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = ${alias}.seniority`);
        const placeholders = seniority.map(() => '?').join(', ');
        conditions.push(`mstc.description IN (${placeholders})`);
        params.push(...seniority);
      }

      if (securedFlag.length > 0) {
        joins.push(`LEFT JOIN master_secured_flag msf ON msf.code = ${alias}.secured_flag`);
        const placeholders = securedFlag.map(() => '?').join(', ');
        conditions.push(`msf.description IN (${placeholders})`);
        params.push(...securedFlag);
      }

      if (businessSector.length > 0) {
        joins.push(`LEFT JOIN master_business_sector mbs ON mbs.code = ${alias}.business_sector`);
        const placeholders = businessSector.map(() => '?').join(', ');
        conditions.push(`mbs.description IN (${placeholders})`);
        params.push(...businessSector);
      }

      // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
      if (issuerNatureType.length > 0) {
        joins.push(`LEFT JOIN master_issuer mi_nature ON mi_nature.id = ${alias}.isin_id`);
        joins.push(`LEFT JOIN master_issuer_type_nature mitn ON mitn.code = mi_nature.nature_type`);
        const placeholders = issuerNatureType.map(() => '?').join(', ');
        conditions.push(`mitn.description IN (${placeholders})`);
        params.push(...issuerNatureType);
      }

      // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
      if (issuerOwnershipType.length > 0) {
        joins.push(`LEFT JOIN master_issuer mi_ownership ON mi_ownership.id = ${alias}.isin_id`);
        joins.push(`LEFT JOIN master_issuer_ownership_type miot ON miot.code = mi_ownership.issuer_ownership_type`);
        const placeholders = issuerOwnershipType.map(() => '?').join(', ');
        conditions.push(`miot.description IN (${placeholders})`);
        params.push(...issuerOwnershipType);
      }

      if (securityType.length > 0) {
        joins.push(`LEFT JOIN master_security_type mst ON mst.code = ${alias}.security_class`);
        const placeholders = securityType.map(() => '?').join(', ');
        conditions.push(`mst.description IN (${placeholders})`);
        params.push(...securityType);
      }

      if (modeOfIssue.length > 0) {
        joins.push(`LEFT JOIN master_mode_issue mmi ON mmi.code = ${alias}.mode_issue`);
        const placeholders = modeOfIssue.map(() => '?').join(', ');
        conditions.push(`mmi.description IN (${placeholders})`);
        params.push(...modeOfIssue);
      }

      if (isin) {
        conditions.push(`${alias}.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      return { joins, conditions, params };
    };

    const commonFilters = buildCommonFilters('mi');
    const commonJoinsSql = commonFilters.joins.join('\n');
    const commonWhereSql = commonFilters.conditions.length > 0
      ? `AND ${commonFilters.conditions.join(' AND ')}`
      : '';
    const commonParams = commonFilters.params;

    // ── Helper to safely extract numeric values from Prisma BigInt results ──
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    // ── Registrar filter helpers ──
    const registrarPlaceholders = registrar.length > 0
      ? registrar.map(() => '?').join(', ')
      : '';
    const registrarWhere = registrar.length > 0
      ? `AND mr.short_name IN (${registrarPlaceholders})`
      : '';
    const registrarExistsWhere = registrar.length > 0
      ? `AND EXISTS (SELECT 1 FROM master_registrar mr WHERE mr.id = ir.registrar_id AND mr.short_name IN (${registrarPlaceholders}))`
      : '';

    /* ── TOTALS (common filters only) ── */
    const totalIssueSizePromise = prisma.$queryRawUnsafe(`
        SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
        FROM isin_re_issuance mi
        JOIN issuer_registrar ir
          ON ir.issuer_id = mi.isin_id
        ${commonJoinsSql}
        WHERE mi.allotment_date BETWEEN ? AND ?
          AND mi.is_visible = 1
          ${commonWhereSql}
          ${registrarExistsWhere}
      `,
      currStartStr,
      currEndStr,
      ...commonParams,
      ...(registrar.length > 0 ? registrar : [])
    );

    const totalIssueSizePrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir
        ON ir.issuer_id = mi.isin_id
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${commonWhereSql}
        ${registrarExistsWhere}
    `,
      prevStartStr,
      prevEndStr,
      ...commonParams,
      ...(registrar.length > 0 ? registrar : [])
    );

    const totalIssuesCountCurrYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir
        ON ir.issuer_id = mi.isin_id
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${commonWhereSql}
        ${registrarExistsWhere}
    `,
      currStartStr,
      currEndStr,
      ...commonParams,
      ...(registrar.length > 0 ? registrar : [])
    );

    const totalIssuesCountPrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS aggregate
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir
        ON ir.issuer_id = mi.isin_id
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
        AND mi.is_visible = 1
        ${commonWhereSql}
        ${registrarExistsWhere}
    `,
      prevStartStr,
      prevEndStr,
      ...commonParams,
      ...(registrar.length > 0 ? registrar : [])
    );

    // Run all totals in parallel
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

    // Safe denominators for market share (avoid division by zero)
    const safeTotalIssueSize = totalIssueSize / 10000000 || 1;
    const safeTotalIssueSizePrev = totalIssueSizePrevYear / 10000000 || 1;
    const safeTotalIssuesCount = totalIssuesCountCurrYear || 1;
    const safeTotalIssuesCountPrev = totalIssuesCountPrevYear || 1;

    /* ── MAIN TABLE QUERY ── */
    const tableBaseParams = registrar.length > 0
      ? [...commonParams, ...registrar]
      : [...commonParams];

    const t1t2Joins = commonJoinsSql;
    const t1t2Where = `${commonWhereSql} ${registrarWhere}`;

    const paginationClause = parsedLimit !== null && parsedLimit > 0
      ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}`
      : '';

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
            ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
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
            ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
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
            ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
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
            ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
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

    // Parameters: [marketShareDenomCurr, marketShareDenomPrev, t1 dates & filters, t2 dates & filters]
    const tableParams = normalizedIssueType === 'count'
      ? [safeTotalIssuesCount, safeTotalIssuesCountPrev, currStartStr, currEndStr, ...tableBaseParams, prevStartStr, prevEndStr, ...tableBaseParams]
      : [safeTotalIssueSize, safeTotalIssueSizePrev, currStartStr, currEndStr, ...tableBaseParams, prevStartStr, prevEndStr, ...tableBaseParams];

    const tableResult = await prisma.$queryRawUnsafe(tableQuery, ...tableParams);

    /* ── TOTAL COUNT ── */
    const countJoins = `${commonJoinsSql}\n${registrar.length > 0 ? 'LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id' : ''}`;
    const countWhere = `${commonWhereSql} ${registrarWhere}`;
    const countParams = registrar.length > 0 ? [...commonParams, ...registrar] : [...commonParams];

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) AS total
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      ${countJoins}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${countWhere}
    `, currStartStr, currEndStr, ...countParams);

    const totalRecords = safeNumber(totalCountResult[0]?.total);

    /* ── SECTOR BREAKUP QUERY ── */
    const sectorValueSelect =
      normalizedIssueType === 'count'
        ? 'COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankJoins = commonJoinsSql;
    const rankWhere = `${commonWhereSql} ${registrarWhere}`;
    const rankParams = registrar.length > 0 ? [...commonParams, ...registrar] : [...commonParams];

    const rankedRegistrarsSubQuery =
      normalizedIssueType === 'count'
        ? `
      SELECT
        mr.id AS registrar_id,
        mr.short_name AS registrar_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      ${rankJoins}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${rankWhere}
      GROUP BY ir.registrar_id
      ORDER BY arr_rank
      LIMIT 10
    `
        : `
      SELECT
        mr.id AS registrar_id,
        mr.short_name AS registrar_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size)DESC, COUNT(DISTINCT ir.registrar_id, mi.allotment_date, mi.issuer_master_id) DESC
        ) AS arr_rank
      FROM isin_re_issuance mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.isin_id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      ${rankJoins}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${rankWhere}
      GROUP BY ir.registrar_id
      ORDER BY arr_rank
      LIMIT 10
    `;

    const sectorCommonJoins = commonFilters.joins.filter(j => !j.includes('master_business_sector')).join('\n');
    const sectorJoins = `${sectorCommonJoins}\n${registrar.length > 0 ? 'LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id' : ''}`;
    const sectorWhere = `${commonWhereSql} ${registrarWhere}`;
    const sectorParams = registrar.length > 0 ? [...commonParams, ...registrar] : [...commonParams];

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
      ${sectorJoins}
      WHERE mi.allotment_date BETWEEN ? AND ? AND mi.is_visible = 1
      ${sectorWhere}
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
      currStartStr, currEndStr, ...rankParams,
      currStartStr, currEndStr, ...sectorParams
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

    // Format dates for MySQL (YYYY-MM-DD HH:MM:SS) — use local time to avoid UTC shift
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

    // ── DYNAMIC FILTER BUILDER ──
    const filterJoins = [];
    const filterConditions = [];
    const filterParams = [];

    if (creditRating.length > 0) {
      const placeholders = creditRating.map(() => '?').join(', ');
      filterConditions.push(`master_issuer_rating.rating IN (${placeholders})`);
      filterParams.push(...creditRating);
    }

    if (registrar.length > 0) {
      filterJoins.push(`LEFT JOIN master_registrar ON master_registrar.id = issuer_registrar.registrar_id`);
      const placeholders = registrar.map(() => '?').join(', ');
      filterConditions.push(`master_registrar.short_name IN (${placeholders})`);
      filterParams.push(...registrar);
    }

    if (seniority.length > 0) {
      filterJoins.push(`LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = isin_re_issuance.seniority`);
      const placeholders = seniority.map(() => '?').join(', ');
      filterConditions.push(`master_seniority_tier_classification.description IN (${placeholders})`);
      filterParams.push(...seniority);
    }

    if (securedFlag.length > 0) {
      filterJoins.push(`LEFT JOIN master_secured_flag ON master_secured_flag.code = isin_re_issuance.secured_flag`);
      const placeholders = securedFlag.map(() => '?').join(', ');
      filterConditions.push(`master_secured_flag.description IN (${placeholders})`);
      filterParams.push(...securedFlag);
    }

    if (businessSector.length > 0) {
      filterJoins.push(`LEFT JOIN master_business_sector ON master_business_sector.code = isin_re_issuance.business_sector`);
      const placeholders = businessSector.map(() => '?').join(', ');
      filterConditions.push(`master_business_sector.description IN (${placeholders})`);
      filterParams.push(...businessSector);
    }

    // ─── FIX: nature_type lives on master_issuer, not isin_re_issuance ───
    if (issuerNatureType.length > 0) {
      filterJoins.push(`LEFT JOIN master_issuer mi_nature ON mi_nature.id = isin_re_issuance.isin_id`);
      filterJoins.push(`LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = mi_nature.nature_type`);
      const placeholders = issuerNatureType.map(() => '?').join(', ');
      filterConditions.push(`master_issuer_type_nature.description IN (${placeholders})`);
      filterParams.push(...issuerNatureType);
    }

    // ─── FIX: issuer_ownership_type lives on master_issuer, not isin_re_issuance ───
    if (issuerOwnershipType.length > 0) {
      filterJoins.push(`LEFT JOIN master_issuer mi_ownership ON mi_ownership.id = isin_re_issuance.isin_id`);
      filterJoins.push(`LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = mi_ownership.issuer_ownership_type`);
      const placeholders = issuerOwnershipType.map(() => '?').join(', ');
      filterConditions.push(`master_issuer_ownership_type.description IN (${placeholders})`);
      filterParams.push(...issuerOwnershipType);
    }

    if (listingStatus.length > 0) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      filterConditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = isin_re_issuance.isin_id AND mls.description IN (${placeholders})
      )`);
      filterParams.push(...listingStatus);
    }

    if (securityType.length > 0) {
      filterJoins.push(`LEFT JOIN master_security_type ON master_security_type.code = isin_re_issuance.security_class`);
      const placeholders = securityType.map(() => '?').join(', ');
      filterConditions.push(`master_security_type.description IN (${placeholders})`);
      filterParams.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      filterJoins.push(`LEFT JOIN master_mode_issue ON master_mode_issue.code = isin_re_issuance.mode_issue`);
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      filterConditions.push(`master_mode_issue.description IN (${placeholders})`);
      filterParams.push(...modeOfIssue);
    }

    if (isin) {
      filterConditions.push(`isin_re_issuance.isin LIKE ?`);
      filterParams.push(`%${isin}%`);
    }

    if (creditRatingAgency.length > 0) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      filterConditions.push(`master_issuer_rating.agency_id IN (
        SELECT id FROM master_agency WHERE short_name IN (${placeholders})
      )`);
      filterParams.push(...creditRatingAgency);
    }

    const joinsSql = filterJoins.join('\n');
    const conditionsSql = filterConditions.length > 0
      ? `AND ${filterConditions.join(' AND ')}`
      : '';

    // ── TOTAL RATINGS (denominator) ──
    const totalQuery = `
      SELECT COUNT(*) AS aggregate
      FROM master_issuer_rating
      INNER JOIN isin_re_issuance
        ON isin_re_issuance.isin_id = master_issuer_rating.issuer_id
      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = isin_re_issuance.isin_id
      ${joinsSql}
      WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND isin_re_issuance.is_visible = 1
      ${conditionsSql}
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(
      totalQuery,
      currStartStr,
      currEndStr,
      ...filterParams
    );

    // Safe number extraction from BigInt
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const totalCount = safeNumber(totalRatingNo[0]?.aggregate) || 1;

    // ── MAIN QUERY ──

    const mainParams = [...filterParams];
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

      LEFT JOIN isin_re_issuance
        ON isin_re_issuance.isin_id = master_issuer_rating.issuer_id

      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = isin_re_issuance.isin_id

      ${joinsSql}

      WHERE isin_re_issuance.allotment_date BETWEEN ? AND ? AND isin_re_issuance.is_visible = 1

      ${conditionsSql}

      GROUP BY 
      master_issuer_rating.rating;
    `;

    const creditRatingResult = await prisma.$queryRawUnsafe(
      creditRatingQuery,
      totalCount,
      currStartStr,
      currEndStr,
      ...mainParams
    );

    // ── FINAL RESPONSE ──
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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
    if (rating.length > 0) {
      const placeholders = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${placeholders})
      )`);
      params.push(...rating);
    }

    // Listing Status (multi-select) — EXISTS
    if (listingStatus.length > 0) {
      const placeholders = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise 
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status 
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${placeholders})
      )`);
      params.push(...listingStatus);
    }

    // Seniority (multi-select)
    if (seniority.length > 0) {
      const placeholders = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${placeholders})`);
      params.push(...seniority);
    }

    // Secured Flag (multi-select)
    if (securedFlag.length > 0) {
      const placeholders = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${placeholders})`);
      params.push(...securedFlag);
    }

    // Sector (multi-select)
    if (sector.length > 0) {
      const placeholders = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${placeholders})`);
      params.push(...sector);
    }

    // Nature (multi-select)
    if (nature.length > 0) {
      const placeholders = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${placeholders})`);
      params.push(...nature);
    }

    // Ownership Type (multi-select)
    if (ownershipType.length > 0) {
      const placeholders = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${placeholders})`);
      params.push(...ownershipType);
    }

    // Credit Rating Agency (multi-select) — EXISTS
    if (creditRatingAgency.length > 0) {
      const placeholders = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir 
        JOIN master_agency ma ON ma.id = mir.agency_id 
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${placeholders})
      )`);
      params.push(...creditRatingAgency);
    }

    // Security Type (multi-select)
    if (securityType.length > 0) {
      const placeholders = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${placeholders})`);
      params.push(...securityType);
    }

    // Mode Of Issue (multi-select)
    if (modeOfIssue.length > 0) {
      const placeholders = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${placeholders})`);
      params.push(...modeOfIssue);
    }

    // Registrar (single-select, LIKE filter) — EXISTS
    if (registrar) {
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

    // ── MAIN DATA QUERY — scalar subqueries for 1:N relationships ──
    const dataQuery = `
      SELECT
        mi.id,
        mi.isin_id,
        mi.isin,
        ANY_VALUE(mi.security_name) AS security_name,
        ANY_VALUE(mi.issue_size) AS issue_size,
        ANY_VALUE(mi.face_value) AS face_value,
        ANY_VALUE(mi.allotment_date) AS allotment_date,
        ANY_VALUE(mi.maturity_date) AS maturity_date,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(miot.description) AS ownership_type,
        ANY_VALUE(mint.description) AS nature,
        ANY_VALUE(mbs.description) AS sector,
        ANY_VALUE(mst.description) AS security_type,
        ANY_VALUE(mmi.description) AS mode_of_issue,
        ANY_VALUE(mstc.description) AS Seniority,
        ANY_VALUE(msf.description) AS secured_flag,
        ANY_VALUE(mtf.description) AS tax_free,
        -- 1:N lookups via scalar subqueries
        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = mi.isin_id
        ) AS debenture_trustee,
        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = mi.isin_id
        ) AS Arranger,
        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = mi.isin_id
        ) AS Registrar,
        (
          SELECT coupon_rate
          FROM issuer_coupon_details
          WHERE issuer_id = mi.isin_id
          LIMIT 1
        ) AS coupon_rate,
        (
          SELECT mir.rating
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating,
        (
          SELECT ma.short_name
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = mi.isin_id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating_agency,
        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status,
        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange mise
          WHERE mise.issuer_id = mi.isin_id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status_code
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
      GROUP BY mi.id, mi.isin_id, mi.isin
      ORDER BY ANY_VALUE(mi.allotment_date) ASC
      LIMIT ? OFFSET ?
    `;

    // ── COUNT QUERY ──
    const countQuery = `
      SELECT COUNT(mi.isin_id) AS total
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

    // ─── FIX: Full day coverage — start at 00:00:00, end at 23:59:59 ───
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
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */
    const conditions = [];
    const params = [];

    // Base filters
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(cyStart, cyEnd);

    conditions.push(`mi.is_visible = 1`);

    // ── 1:N relationship filters (EXISTS = no row multiplication) ──
    if (rating.length > 0) {
      const ph = rating.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND mir.rating IN (${ph})
      )`);
      params.push(...rating);
    }

    if (creditRatingAgency.length > 0) {
      const ph = creditRatingAgency.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir
        JOIN master_agency ma ON ma.id = mir.agency_id AND ma.parent_id = 0
        WHERE mir.issuer_id = mi.isin_id AND ma.short_name IN (${ph})
      )`);
      params.push(...creditRatingAgency);
    }

    if (listingStatus.length > 0) {
      const ph = listingStatus.map(() => '?').join(', ');
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = mi.isin_id AND mls.description IN (${ph})
      )`);
      params.push(...listingStatus);
    }

    // ── 1:1 lookup filters (safe to JOIN directly) ──
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (ownershipType.length > 0) {
      const ph = ownershipType.map(() => '?').join(', ');
      conditions.push(`miot.description IN (${ph})`);
      params.push(...ownershipType);
    }

    if (sector.length > 0) {
      const ph = sector.map(() => '?').join(', ');
      conditions.push(`mbs.description IN (${ph})`);
      params.push(...sector);
    }

    if (nature.length > 0) {
      const ph = nature.map(() => '?').join(', ');
      conditions.push(`mint.description IN (${ph})`);
      params.push(...nature);
    }

    if (securityType.length > 0) {
      const ph = securityType.map(() => '?').join(', ');
      conditions.push(`mst.description IN (${ph})`);
      params.push(...securityType);
    }

    if (modeOfIssue.length > 0) {
      const ph = modeOfIssue.map(() => '?').join(', ');
      conditions.push(`mmi.description IN (${ph})`);
      params.push(...modeOfIssue);
    }

    if (seniority.length > 0) {
      const ph = seniority.map(() => '?').join(', ');
      conditions.push(`mstc.description IN (${ph})`);
      params.push(...seniority);
    }

    if (taxFree.length > 0) {
      const ph = taxFree.map(() => '?').join(', ');
      conditions.push(`mtf.description IN (${ph})`);
      params.push(...taxFree);
    }

    if (securedFlag.length > 0) {
      const ph = securedFlag.map(() => '?').join(', ');
      conditions.push(`msf.description IN (${ph})`);
      params.push(...securedFlag);
    }

    if (registrar) {
      conditions.push(`registrar_master.short_name LIKE ?`);
      params.push(`%${registrar}%`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       - No DISTINCT subquery
       - No 1:N LEFT JOINs (ratings, listing_status moved to EXISTS)
       - Direct aggregation with registrar join
    --------------------------------- */
    const query = `
      SELECT
        MONTH(mi.allotment_date)     AS issue_month_no,
        MONTHNAME(mi.allotment_date) AS issue_month,
        COUNT(CONCAT(mi.isin_id, '-', ir.registrar_id)) AS no_of_issue,
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
      LEFT JOIN master_issuer 
        ON master_issuer.id = mi.isin_id
      LEFT JOIN master_issuer_ownership_type miot
        ON miot.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_business_sector mbs
        ON mbs.code = mi.business_sector
      LEFT JOIN master_issuer_type_nature mint
        ON mint.code = master_issuer.nature_type
      LEFT JOIN master_security_type mst
        ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi
        ON mmi.code = mi.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf
        ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf
        ON msf.code = mi.secured_flag
      ${whereClause}
      GROUP BY
        MONTH(mi.allotment_date),
        MONTHNAME(mi.allotment_date)
      ORDER BY
        MONTH(mi.allotment_date) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // ─── FIX: Merge SQL results with expected month list (includes empty months) ───
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

    // Registrar Name filter (LIKE search, array support)
    if (registrarName && (Array.isArray(registrarName) ? registrarName.length > 0 : registrarName !== '')) {
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

    // Issuer Name filter (LIKE search, array support)
    if (issuerName && (Array.isArray(issuerName) ? issuerName.length > 0 : issuerName !== '')) {
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

    // ISIN filter (LIKE search, array support)
    if (isin && (Array.isArray(isin) ? isin.length > 0 : isin !== '')) {
      const isinValue = Array.isArray(isin) ? isin : [isin];
      const inClause = buildInClause('i.isin', isinValue, true);
      if (inClause) {
        conditions.push(inClause.clause);
        params.push(...inClause.params);
      }
    }

    // Rating filter (array support)
    if (rating && (Array.isArray(rating) ? rating.length > 0 : rating !== '')) {
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

    // Seniority filter (array support)
    if (seniority && (Array.isArray(seniority) ? seniority.length > 0 : seniority !== '')) {
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

    // Tax Free filter (array support)
    if (taxFree && (Array.isArray(taxFree) ? taxFree.length > 0 : taxFree !== '')) {
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

    // Secured Flag filter (array support)
    if (securedFlag && (Array.isArray(securedFlag) ? securedFlag.length > 0 : securedFlag !== '')) {
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

    // Trustee filter (array support, LIKE search)
    if (trustee && (Array.isArray(trustee) ? trustee.length > 0 : trustee !== '')) {
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

    // Credit Rating Agency filter (array support, LIKE search)
    if (creditRatingAgency && (Array.isArray(creditRatingAgency) ? creditRatingAgency.length > 0 : creditRatingAgency !== '')) {
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

    // Listing Status filter (array support)
    if (listingStatus && (Array.isArray(listingStatus) ? listingStatus.length > 0 : listingStatus !== '')) {
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

    // Security Type filter (array support)
    if (securityType && (Array.isArray(securityType) ? securityType.length > 0 : securityType !== '')) {
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

    // Mode of Issue filter (array support)
    if (modeOfIssue && (Array.isArray(modeOfIssue) ? modeOfIssue.length > 0 : modeOfIssue !== '')) {
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

    // Arranger filter (array support, LIKE search)
    if (arranger && (Array.isArray(arranger) ? arranger.length > 0 : arranger !== '')) {
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
    // DATA QUERY — scalar subqueries for 1:N relationships
    // =========================
    const dataQuery = `
      SELECT
        i.isin_id AS issuerId,
        i.isin,
        ANY_VALUE(id.issuer_name) AS issuer_name,
        ANY_VALUE(i.allotment_date) AS allotment_date,
        (SELECT coupon_rate FROM issuer_coupon_details WHERE issuer_id = i.isin_id LIMIT 1) AS coupon_rate,
        mr.short_name AS registrar_detail,
        (SELECT mt.short_name FROM issuer_trustee it JOIN master_trustee mt ON mt.id = it.trustee_id WHERE it.issuer_id = i.isin_id LIMIT 1) AS debenture_trustee_name,
        ANY_VALUE(i.maturity_date) AS maturity_date,
        (SELECT GROUP_CONCAT(DISTINCT mir.rating) FROM master_issuer_rating mir WHERE mir.issuer_id = i.isin_id) AS rating,
        (SELECT GROUP_CONCAT(DISTINCT mag.short_name) FROM master_issuer_rating mir JOIN master_agency mag ON mag.id = mir.agency_id WHERE mir.issuer_id = i.isin_id) AS agency_name,
        (SELECT GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating)) FROM master_issuer_rating mir JOIN master_agency mag ON mag.id = mir.agency_id WHERE mir.issuer_id = i.isin_id) AS rating_info,
        (SELECT GROUP_CONCAT(DISTINCT ma.short_name) FROM issuer_arranger ia JOIN master_arranger ma ON ma.id = ia.arranger_id WHERE ia.issuer_id = i.isin_id) AS arranger_name,
        ANY_VALUE(i.security_name) AS security_name,
        ANY_VALUE(s.description) AS security_type,
        ANY_VALUE(mi.description) AS mode_issue,
        ANY_VALUE(i.issue_size) AS issue_size,
        ANY_VALUE(i.face_value) AS face_value,
        ANY_VALUE(mstc.description) AS seniority,
        ANY_VALUE(tf.description) AS tax_free,
        ANY_VALUE(msf.description) AS secured_flag,
        (SELECT description FROM master_issuer_stock_exchange mise LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = i.isin_id ORDER BY mise.listing_status LIMIT 1) AS listing_status,
        ANY_VALUE(i.issuer_master_id) AS issuer_master_id,
        ir1.registrar_id
      FROM isin_re_issuance i
      INNER JOIN issuer_registrar ir1 ON i.isin_id = ir1.issuer_id
      INNER JOIN master_registrar mr ON mr.id = ir1.registrar_id
      LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
      LEFT JOIN master_security_type s ON s.code = i.security_class
      LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
      ${whereClause}
      GROUP BY i.isin_id, ir1.registrar_id, mr.short_name, i.isin
      ORDER BY ANY_VALUE(id.issuer_name)
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY — simplified, no 1:N joins
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.isin_id, ir1.registrar_id
        FROM isin_re_issuance i
        INNER JOIN issuer_registrar ir1 ON i.isin_id = ir1.issuer_id
        INNER JOIN master_registrar mr ON mr.id = ir1.registrar_id
        LEFT JOIN issuer_details id ON id.id = i.issuer_master_id
        LEFT JOIN master_security_type s ON s.code = i.security_class
        LEFT JOIN master_mode_issue mi ON mi.code = i.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = i.seniority
        LEFT JOIN master_tax_free tf ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag msf ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.isin_id, ir1.registrar_id, mr.short_name, i.isin
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
        message:
          'startDate, endDate and registrarId are required',
      });
    }

    const parsedRegistrarId = parseInt(registrarId, 10);

    if (
      isNaN(parsedRegistrarId) ||
      parsedRegistrarId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'registrarId must be a positive integer',
      });
    }

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (
      isNaN(parsedLimit) ||
      parsedLimit < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'limit must be a non-negative integer',
      });
    }

    if (
      isNaN(parsedOffset) ||
      parsedOffset < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'offset must be a non-negative integer',
      });
    }

    // ── DATE FORMATTING ──

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

      return date
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(
      startDate,
      false
    );

    const sqlEndDate = formatDateTime(
      endDate,
      true
    );

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    if (
      new Date(startDate) >
      new Date(endDate)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'startDate must be before or equal to endDate',
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

    const orderBy = validSortFields.includes(
      sortField
    )
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // ── SEARCH CONFIGURATION ──

    const searchTerm =
      SearchQuery?.trim() || '';

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
        (
          Array.isArray(values) &&
          values.length === 0
        )
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
          .map(
            () => `${field} LIKE ?`
          )
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

    conditions.push(
      `ir1.registrar_id = ?`
    );

    params.push(parsedRegistrarId);

    conditions.push(
      `i.allotment_date BETWEEN ? AND ?`
    );

    params.push(
      sqlStartDate,
      sqlEndDate
    );

    conditions.push(
      `i.is_visible = 1`
    );

    // ── Ownership Type ──

    if (
      ownershipType &&
      (
        Array.isArray(ownershipType)
          ? ownershipType.length > 0
          : ownershipType !== ''
      )
    ) {
      const ownershipValue =
        Array.isArray(ownershipType)
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
              ON miot2.code =
                 mi2.issuer_ownership_type
            WHERE mi2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Nature ──

    if (
      nature &&
      (
        Array.isArray(nature)
          ? nature.length > 0
          : nature !== ''
      )
    ) {
      const natureValue =
        Array.isArray(nature)
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
              ON mitn2.code =
                 mi2.nature_type
            WHERE mi2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Sector ──

    if (
      sector &&
      (
        Array.isArray(sector)
          ? sector.length > 0
          : sector !== ''
      )
    ) {
      const sectorValue =
        Array.isArray(sector)
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
            WHERE mbs2.code =
                  i.business_sector
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Security Type ──

    if (
      securityType &&
      (
        Array.isArray(securityType)
          ? securityType.length > 0
          : securityType !== ''
      )
    ) {
      const securityValue =
        Array.isArray(securityType)
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
            WHERE mst2.code =
                  i.security_class
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Mode of Issue ──

    if (
      modeOfIssue &&
      (
        Array.isArray(modeOfIssue)
          ? modeOfIssue.length > 0
          : modeOfIssue !== ''
      )
    ) {
      const modeValue =
        Array.isArray(modeOfIssue)
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
            WHERE mmi2.code =
                  i.mode_issue
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Credit Rating Agency ──

    if (
      creditRatingAgency &&
      (
        Array.isArray(
          creditRatingAgency
        )
          ? creditRatingAgency.length > 0
          : creditRatingAgency !== ''
      )
    ) {
      const agencyValue =
        Array.isArray(
          creditRatingAgency
        )
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
              ON mag2.id =
                 mir2.agency_id
            WHERE mir2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Rating ──

    if (
      rating &&
      (
        Array.isArray(rating)
          ? rating.length > 0
          : rating !== ''
      )
    ) {
      const ratingValue =
        Array.isArray(rating)
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
            WHERE mir2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Seniority ──

    if (
      seniority &&
      (
        Array.isArray(seniority)
          ? seniority.length > 0
          : seniority !== ''
      )
    ) {
      const seniorityValue =
        Array.isArray(seniority)
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
            WHERE mstc2.code =
                  i.seniority
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Tax Free ──

    if (
      taxFree &&
      (
        Array.isArray(taxFree)
          ? taxFree.length > 0
          : taxFree !== ''
      )
    ) {
      const taxFreeValue =
        Array.isArray(taxFree)
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
            WHERE mtf2.code =
                  i.tax_free
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Secured Flag ──

    if (
      securedFlag &&
      (
        Array.isArray(securedFlag)
          ? securedFlag.length > 0
          : securedFlag !== ''
      )
    ) {
      const securedFlagValue =
        Array.isArray(securedFlag)
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
            WHERE msf2.code =
                  i.secured_flag
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Listing Status ──

    if (
      listingStatus &&
      (
        Array.isArray(listingStatus)
          ? listingStatus.length > 0
          : listingStatus !== ''
      )
    ) {
      const listingValue =
        Array.isArray(listingStatus)
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
              ON mls2.code =
                 mise2.listing_status
            WHERE mise2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Arranger ──

    if (
      arranger &&
      (
        Array.isArray(arranger)
          ? arranger.length > 0
          : arranger !== ''
      )
    ) {
      const arrangerValue =
        Array.isArray(arranger)
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
              ON ma2.id =
                 ia2.arranger_id
            WHERE ia2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Trustee ──

    if (
      trustee &&
      (
        Array.isArray(trustee)
          ? trustee.length > 0
          : trustee !== ''
      )
    ) {
      const trusteeValue =
        Array.isArray(trustee)
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
              ON mt2.id =
                 it2.trustee_id
            WHERE it2.issuer_id =
                  i.isin_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    // ── ISIN ──

    if (
      isin &&
      (
        Array.isArray(isin)
          ? isin.length > 0
          : isin !== ''
      )
    ) {
      const isinValue =
        Array.isArray(isin)
          ? isin
          : [isin];

      const inClause = buildInClause(
        'i.isin',
        isinValue,
        true
      );

      if (inClause) {
        conditions.push(
          inClause.clause
        );

        params.push(
          ...inClause.params
        );
      }
    }

    // ── Issuer Name ──

    if (
      issuerName &&
      (
        Array.isArray(issuerName)
          ? issuerName.length > 0
          : issuerName !== ''
      )
    ) {
      const issuerNameValue =
        Array.isArray(issuerName)
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
            WHERE id2.id =
                  i.issuer_master_id
              AND ${inClause.clause}
          )
        `);

        params.push(
          ...inClause.params
        );
      }
    }

    const whereClause =
      conditions.join(' AND ');

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
          WHERE icd.issuer_id =
                i.isin_id
        ) AS coupon_rate,

        mr.short_name AS registrar_detail,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mt.short_name
            SEPARATOR ', '
          )
          FROM issuer_trustee it
          JOIN master_trustee mt
            ON mt.id =
               it.trustee_id
          WHERE it.issuer_id =
                i.isin_id
        ) AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(
            DISTINCT mir.rating
            SEPARATOR ', '
          )
          FROM master_issuer_rating mir
          WHERE mir.issuer_id =
                i.isin_id
        ) AS rating,

        (
          SELECT GROUP_CONCAT(
            DISTINCT ma.short_name
            SEPARATOR ', '
          )
          FROM issuer_arranger ia
          JOIN master_arranger ma
            ON ma.id =
               ia.arranger_id
          WHERE ia.issuer_id =
                i.isin_id
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
            ON mag.id =
               mir.agency_id
          WHERE mir.issuer_id =
                i.isin_id
        ) AS agency_name,

        mstc.description AS seniority,

        tf.description AS tax_free,

        msf.description AS secured_flag,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls
            ON mls.code =
               mise.listing_status
          WHERE mise.issuer_id =
                i.isin_id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM isin_re_issuance i

      INNER JOIN issuer_registrar ir1
        ON i.isin_id =
           ir1.issuer_id

      INNER JOIN master_registrar mr
        ON ir1.registrar_id =
           mr.id

      LEFT JOIN issuer_details id
        ON i.issuer_master_id =
           id.id

      LEFT JOIN master_security_type s
        ON i.security_class =
           s.code

      LEFT JOIN master_mode_issue mi
        ON i.mode_issue =
           mi.code

      LEFT JOIN master_seniority_tier_classification mstc
        ON mstc.code =
           i.seniority

      LEFT JOIN master_tax_free tf
        ON tf.code =
           i.tax_free

      LEFT JOIN master_secured_flag msf
        ON msf.code =
           i.secured_flag

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

      dataParams.push(
        ...searchParams
      );
    }

    dataQuery += `
      ORDER BY
        ${orderBy}
        ${orderDirection}
      LIMIT ?
      OFFSET ?
    `;

    dataParams.push(
      parsedLimit,
      parsedOffset
    );

    // =========================
    // NORMAL COUNT
    // =========================
    //
    // Counts individual filtered
    // records.
    //
    // =========================

    let countQuery = `
      SELECT COUNT(*) AS total
      FROM (${baseQuery}) x
      WHERE 1=1
    `;

    const countParams = [...params];

    if (searchPattern) {
      countQuery += searchClause;

      countParams.push(
        ...searchParams
      );
    }

    // =========================
    // CLUBBED COUNT
    // =========================

    let clubbedCountQuery = `
      SELECT COUNT(*) AS clubbedTotal
      FROM (
        SELECT
          issuer_name,
          DATE(allotment_date)
            AS allotment_date
        FROM (${baseQuery}) x
        WHERE 1=1
    `;

    const clubbedCountParams =
      [...params];

    if (searchPattern) {
      clubbedCountQuery +=
        searchClause;

      clubbedCountParams.push(
        ...searchParams
      );
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

      // Total individual records
      totalRecords: Number(
        totalCount[0]?.total || 0
      ),

      // Total unique
      // issuer + allotment date
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