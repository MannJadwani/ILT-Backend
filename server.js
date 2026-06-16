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
        master_issuer
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
      INNER JOIN master_issuer
        ON master_issuer.issuer_master_id = issuer_details.id
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
      INNER JOIN master_issuer 
        ON issuer_arranger.issuer_id = master_issuer.id
      INNER JOIN issuer_details 
        ON master_issuer.issuer_master_id = issuer_details.id
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
      INNER JOIN master_issuer 
        ON issuer_trustee.issuer_id = master_issuer.id
      INNER JOIN issuer_details 
        ON master_issuer.issuer_master_id = issuer_details.id
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
      INNER JOIN master_issuer 
        ON issuer_registrar.issuer_id = master_issuer.id
      INNER JOIN issuer_details 
        ON master_issuer.issuer_master_id = issuer_details.id
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
      INNER JOIN master_issuer 
        ON master_issuer_rating.issuer_id = master_issuer.id
      INNER JOIN issuer_details 
        ON master_issuer.issuer_master_id = issuer_details.id
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
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY master_issuer.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const arrangersQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      INNER JOIN issuer_arranger on issuer_arranger.issuer_id = master_issuer.id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY master_issuer.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const trusteeQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      INNER JOIN issuer_trustee on issuer_trustee.issuer_id = master_issuer.id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY master_issuer.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const registrarQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      INNER JOIN issuer_registrar on issuer_registrar.issuer_id = master_issuer.id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY master_issuer.business_sector, b.description
      ORDER BY issue_size DESC
      LIMIT 10;
    `;

    const ratingAgenciesQuery = `
      SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      INNER JOIN master_issuer_rating on master_issuer_rating.issuer_id = master_issuer.id
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      GROUP BY master_issuer.business_sector, b.description
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
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      ${joinClause}
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
      GROUP BY master_agency.short_name
    `;

    // Execute queries concurrently
    const [issuers, arrangers, trustees, registrars, ratingAgencies] = await Promise.all([
      prisma.$queryRawUnsafe(buildQuery()), // Base query
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_arranger ON issuer_arranger.issuer_id = i.id')),
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_trustee ON issuer_trustee.issuer_id = i.id')),
      prisma.$queryRawUnsafe(buildQuery('INNER JOIN issuer_registrar ON issuer_registrar.issuer_id = i.id')),
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
        MONTH(master_issuer.allotment_date) as allotment_month,
        a.month_name as month_name,
        ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
        COUNT(master_issuer.isin) AS issue_count
      FROM master_issuer
      JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
      WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
      GROUP BY allotment_month, a.month_name
      ORDER BY allotment_month ASC
    `;

    const previousYearQuery = `
      SELECT
        MONTH(master_issuer.allotment_date) as allotment_month,
        a.month_name as month_name,
        ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
        COUNT(master_issuer.isin) AS issue_count
      FROM master_issuer
      JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
      WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
        (SELECT COALESCE((ROUND(MAX(issue_size)/10000000)),0)
        FROM master_issuer 
        WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)) as largest_issue_size, 
        
        COALESCE((ROUND(SUM(issue_size)/10000000)), 0) as total_issue_size_in_cr,
        
        COALESCE((ROUND(AVG(issue_size)/10000000)), 0) as avg_issue_size_in_cr,
        
        COUNT(*) as total_issues,
        
        (SELECT b.description 
        FROM master_issuer mi
        INNER JOIN master_business_sector b ON b.code = mi.business_sector
        WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
          AND mi.business_sector IS NOT NULL
        GROUP BY mi.business_sector, b.description
        ORDER BY SUM(mi.issue_size) DESC
        LIMIT 1) as top_sector_by_volume
    FROM master_issuer
    WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1);
    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard stats  data', message: error.message });
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
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      and issuer_master_id = ${id}
      GROUP BY master_issuer.business_sector, b.description
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
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between '${startDate}' AND '${endDate}' AND (is_visible = 1)
      and FIND_IN_SET(i.id,master_issuer_rating.issuer_id) 
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_arranger AS ia 
    ON ia.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_arranger AS ia 
    ON ia.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_arranger AS ia
    ON ia.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
LEFT JOIN master_issuer AS i 
    ON i.id = master_issuer_rating.issuer_id
INNER JOIN issuer_arranger 
    ON issuer_arranger.issuer_id = i.id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_trustee AS it
    ON it.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_trustee AS it
    ON it.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_trustee AS it
    ON it.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
LEFT JOIN master_issuer AS i 
    ON i.id = master_issuer_rating.issuer_id
INNER JOIN issuer_trustee 
    ON issuer_trustee.issuer_id = i.id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_registrar AS ir 
    ON ir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN issuer_registrar AS ir 
    ON ir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN issuer_registrar AS ir
    ON ir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
LEFT JOIN master_issuer AS i 
    ON i.id = master_issuer_rating.issuer_id
INNER JOIN issuer_registrar 
    ON issuer_registrar.issuer_id = i.id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
JOIN all_months AS a 
    ON a.month_no = MONTH(mi.allotment_date)
JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
FROM master_issuer AS mi
INNER JOIN master_business_sector AS b 
    ON b.code = mi.business_sector
INNER JOIN master_issuer_rating AS mir
    ON mir.issuer_id = mi.id
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
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
LEFT JOIN master_issuer AS i
    ON i.id = master_issuer_rating.issuer_id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}' AND (is_visible = 1)
    AND master_issuer_rating.agency_id = ${id}
GROUP BY 
    master_issuer_rating.rating;

        `;
        // Valid tab, proceed
        break;
      default:
        currentYearQuery = `
  SELECT
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}' AND (is_visible = 1)
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY allotment_month ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}' AND (is_visible = 1)
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
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL AND (is_visible = 1)
      and issuer_master_id = ${id}
      GROUP BY master_issuer.business_sector, b.description
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
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between '${startDate}' AND '${endDate}' AND (is_visible = 1)
      and FIND_IN_SET(i.id,master_issuer_rating.issuer_id) 
      order by master_issuer_rating.rating_date 
      asc
        `;
    }

    //monthly comparison query
    //     const currentYearQuery = `
    //   SELECT
    //     MONTH(master_issuer.allotment_date) as allotment_month,
    //     a.month_name as month_name,
    //     ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    //     COUNT(master_issuer.isin) AS issue_count
    //   FROM master_issuer
    //   JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
    //   WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
    //   AND issuer_master_id = ${id}
    //   GROUP BY allotment_month, a.month_name
    //   ORDER BY a.id ASC
    // `;

    //     const previousYearQuery = `
    //   SELECT
    //     MONTH(master_issuer.allotment_date) as allotment_month,
    //     a.month_name as month_name,
    //     ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    //     COUNT(master_issuer.isin) AS issue_count
    //   FROM master_issuer
    //   JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
    //   WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
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
    //   FROM master_issuer
    //   INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
    //   WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
    //   and issuer_master_id = ${id}
    //   GROUP BY master_issuer.business_sector
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
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${id} 
      and i.allotment_date between "2025-04-01 00:00:00" and "2025-11-07 23:59:59"  
      and FIND_IN_SET(i.id,master_issuer_rating.issuer_id) 
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

  const query = `
      select
all_months.month_no as issue_month_no,
MONTHNAME(STR_TO_DATE(all_months.month_no, '%m')) as issue_month,
count(i.isin) as no_of_issue,
IF(SUM(i.issue_size) > 0 , ROUND(SUM(i.issue_size) / 10000000, 2), 0) as issue_size,
SUM(i.issue_size) as actual_issue_size 
from all_months 
inner join master_issuer as i on all_months.month_no = month(i.allotment_date) and i.allotment_date between ${startDate} and ${endDate} group by all_months.month_no order by all_months.id asc
    `;

  const result = await prisma.$queryRawUnsafe(query);

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
              on issuer_details.id = master_issuer.issuer_master_id
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
              on issuer_details.id = master_issuer.issuer_master_id
            join issuer_arranger 
              on issuer_arranger.issuer_id = master_issuer.id
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
              on issuer_details.id = master_issuer.issuer_master_id
            join issuer_trustee 
              on issuer_trustee.issuer_id = master_issuer.id
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
              on issuer_details.id = master_issuer.issuer_master_id
            join issuer_registrar 
              on issuer_registrar.issuer_id = master_issuer.id
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
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${startDate}' AND '${endDate}' AND (is_visible = 1)
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${formatDate(pyStartDate)}' AND '${formatDate(pyEndDate)}' AND (is_visible = 1)
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
        FROM master_issuer
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
        FROM master_issuer
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

    // ─── Build dynamic WHERE conditions ───
    const conditions = [];
    const filterParams = [];

    // Date range is always first two params for each period
    const dateConditions = `master_issuer.allotment_date BETWEEN ? AND ? AND (is_visible = 1)`;

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      filterParams.push(`%${issuerName}%`);
    }
    if (rating) {
      conditions.push(`master_issuer_rating.rating = ?`);
      filterParams.push(rating);
    }
    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      filterParams.push(`%${dealSize}%`);
    }
    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      filterParams.push(listingStatus);
    }
    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      filterParams.push(seniority);
    }
    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      filterParams.push(taxFree);
    }
    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      filterParams.push(securedFlag);
    }
    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      filterParams.push(sector);
    }
    if (trustee) {
      conditions.push(`master_trustee.short_name = ?`);
      filterParams.push(trustee);
    }
    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      filterParams.push(nature);
    }
    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      filterParams.push(ownershipType);
    }
    if (creditRatingAgency) {
      conditions.push(`master_agency.short_name = ?`);
      filterParams.push(creditRatingAgency);
    }
    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      filterParams.push(securityType);
    }
    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      filterParams.push(modeOfIssue);
    }

    const filterClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = master_issuer.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = master_issuer.id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = master_issuer.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = master_issuer.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = master_issuer.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = master_issuer.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = master_issuer.id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = master_issuer.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = master_issuer.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = master_issuer.id
    `;

    // ─── Total aggregate queries (deduplicated to avoid join inflation) ───
    const totalIssueSizeQuery = `
      SELECT SUM(m.issue_size) as aggregate 
      FROM master_issuer m
      WHERE m.id IN (
        SELECT DISTINCT master_issuer.id
        FROM master_issuer
        ${baseJoins}
        WHERE ${dateConditions} ${filterClause}
      )
    `;

    const totalIssuesCountQuery = `
      SELECT COUNT(DISTINCT master_issuer.id) as aggregate
      FROM master_issuer
      ${baseJoins}
      WHERE ${dateConditions} ${filterClause}
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
    // When total is 0, market share should be 0, not calculated against 1
    const cySizeDivisor = totalIssueSizeCY / 10000000;
    const pySizeDivisor = totalIssueSizePY / 10000000;
    const cyCountDivisor = totalIssuesCountCY;
    const pyCountDivisor = totalIssuesCountPY;

    // ─── FIX: Build table query with explicit params to avoid any confusion ───
    const rankByCount = issueType === 'count';

    const rankOrder = rankByCount
      ? `COUNT(DISTINCT mi.isin) DESC, ROUND(SUM(mi.issue_size) / 10000000, 2) DESC`
      : `ROUND(SUM(mi.issue_size) / 10000000, 2) DESC, COUNT(DISTINCT mi.isin) DESC`;

    const shareColumn = rankByCount ? 'no_issues' : 'issue_size';
    const cyDivisor = rankByCount ? cyCountDivisor : cySizeDivisor;
    const pyDivisor = rankByCount ? pyCountDivisor : pySizeDivisor;

    // ─── FIX: Use a single CTE-based query instead of running heavy subquery twice ───
    // This is more efficient and eliminates the param mismatch risk entirely
    const tableQuery = `
      WITH 
      cy_data AS (
        SELECT
          issuer_details.id,
          issuer_details.issuer_name,
          COUNT(DISTINCT mi.isin) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT master_issuer.id, master_issuer.issuer_master_id, master_issuer.isin, master_issuer.issue_size
          FROM master_issuer
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
          COUNT(DISTINCT mi.isin) as no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) as issue_size,
          RANK() OVER ( ORDER BY ${rankOrder} ) as arr_rank
        FROM (
          SELECT DISTINCT master_issuer.id, master_issuer.issuer_master_id, master_issuer.isin, master_issuer.issue_size
          FROM master_issuer
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

    // ─── Build dynamic filter conditions (excluding date range) ───
    const conditions = [];
    const filterParams = [];

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      filterParams.push(`%${issuerName}%`);
    }
    if (rating) {
      conditions.push(`master_issuer_rating.rating = ?`);
      filterParams.push(rating);
    }
    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      filterParams.push(`%${dealSize}%`);
    }
    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      filterParams.push(listingStatus);
    }
    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      filterParams.push(seniority);
    }
    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      filterParams.push(taxFree);
    }
    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      filterParams.push(securedFlag);
    }
    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      filterParams.push(sector);
    }
    if (trustee) {
      conditions.push(`master_trustee.short_name = ?`);
      filterParams.push(trustee);
    }
    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      filterParams.push(nature);
    }
    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      filterParams.push(ownershipType);
    }
    if (creditRatingAgency) {
      conditions.push(`master_agency.short_name = ?`);
      filterParams.push(creditRatingAgency);
    }
    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      filterParams.push(securityType);
    }
    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      filterParams.push(modeOfIssue);
    }

    const filterClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = master_issuer.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = master_issuer.id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = master_issuer.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = master_issuer.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = master_issuer.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = master_issuer.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = master_issuer.id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = master_issuer.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = master_issuer.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = master_issuer.id
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
          SELECT DISTINCT master_issuer.id, master_issuer.business_sector, master_issuer.isin, master_issuer.issue_size
          FROM master_issuer
          ${baseJoins}
          WHERE master_issuer.allotment_date BETWEEN ? AND ? AND (is_visible = 1) ${filterClause}
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
          SELECT DISTINCT master_issuer.id, master_issuer.business_sector, master_issuer.isin, master_issuer.issue_size
          FROM master_issuer
          ${baseJoins}
          WHERE master_issuer.allotment_date BETWEEN ? AND ? AND (is_visible = 1) ${filterClause}
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

    // ─── Build dynamic filter conditions (excluding date range) ───
    const filterConditions = [];
    const filterParams = [];

    if (issuerName) {
      filterConditions.push(`issuer_details.issuer_name LIKE ?`);
      filterParams.push(`%${issuerName}%`);
    }
    if (rating) {
      filterConditions.push(`master_issuer_rating.rating = ?`);
      filterParams.push(rating);
    }
    if (dealSize) {
      filterConditions.push(`master_issuer.issue_size LIKE ?`);
      filterParams.push(`%${dealSize}%`);
    }
    if (listingStatus) {
      filterConditions.push(`listing_data.listing_status = ?`);
      filterParams.push(listingStatus);
    }
    if (seniority) {
      filterConditions.push(`master_seniority_tier_classification.description = ?`);
      filterParams.push(seniority);
    }
    if (taxFree) {
      filterConditions.push(`master_tax_free.description = ?`);
      filterParams.push(taxFree);
    }
    if (securedFlag) {
      filterConditions.push(`master_secured_flag.description = ?`);
      filterParams.push(securedFlag);
    }
    if (sector) {
      filterConditions.push(`master_business_sector.description = ?`);
      filterParams.push(sector);
    }
    if (trustee) {
      filterConditions.push(`master_trustee.short_name = ?`);
      filterParams.push(trustee);
    }
    if (nature) {
      filterConditions.push(`master_issuer_type_nature.description = ?`);
      filterParams.push(nature);
    }
    if (ownershipType) {
      filterConditions.push(`master_issuer_ownership_type.description = ?`);
      filterParams.push(ownershipType);
    }
    if (creditRatingAgency) {
      filterConditions.push(`master_agency.short_name = ?`);
      filterParams.push(creditRatingAgency);
    }
    if (securityType) {
      filterConditions.push(`master_security_type.description = ?`);
      filterParams.push(securityType);
    }
    if (modeOfIssue) {
      filterConditions.push(`master_mode_issue.description = ?`);
      filterParams.push(modeOfIssue);
    }

    const filterClause = filterConditions.length > 0 ? ` AND ${filterConditions.join(' AND ')}` : '';

    // ─── Base joins needed for all filter conditions ───
    const baseJoins = `
      LEFT JOIN issuer_details ON issuer_details.id = master_issuer.issuer_master_id
      LEFT JOIN master_issuer_rating ON master_issuer_rating.issuer_id = master_issuer.id
      LEFT JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = master_issuer.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = master_issuer.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = master_issuer.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = master_issuer.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = master_issuer.id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN master_security_type ON master_security_type.code = master_issuer.security_class
      LEFT JOIN master_mode_issue ON master_mode_issue.code = master_issuer.mode_issue
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = master_issuer.id
    `;

    // ─── Issue data (current year) ───
    const issueData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(mi.allotment_date) AS month,
        MONTHNAME(mi.allotment_date) AS label,
        ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT mi.isin) AS isin_count
      FROM (
        SELECT DISTINCT master_issuer.id, master_issuer.allotment_date, master_issuer.isin, master_issuer.issue_size
        FROM master_issuer
        ${baseJoins}
        WHERE master_issuer.allotment_date BETWEEN ? AND ? AND (is_visible = 1) ${filterClause}
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
        COUNT(DISTINCT mi.isin) AS isin_count
      FROM (
        SELECT DISTINCT master_issuer.id, master_issuer.maturity_date, master_issuer.isin, master_issuer.issue_size
        FROM master_issuer
        ${baseJoins}
        WHERE master_issuer.maturity_date BETWEEN ? AND ? AND (is_visible = 1) ${filterClause}
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
    // For simplicity and maximum compatibility, we keep per-month but fix the logic
    const outstandingPromises = allMonthRanges.map(async ({ label, start, end }) => {
      const [result] = await prisma.$queryRawUnsafe(`
        SELECT ROUND(SUM(mi.issue_size) / 10000000, 2) AS aggregate
        FROM (
          SELECT DISTINCT master_issuer.id, master_issuer.issue_size
          FROM master_issuer
          ${baseJoins}
          WHERE master_issuer.allotment_date < ?
            AND master_issuer.maturity_date > ? 
            AND master_issuer.is_visible = 1
            AND master_issuer.security_status = 1${filterClause}
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

    // ─── FIX: Define getShortMonthName (was missing!) ───
    // function getShortMonthName(fullMonthName) {
    //   const monthMap = {
    //     'January': 'Jan', 'February': 'Feb', 'March': 'Mar', 'April': 'Apr',
    //     'May': 'May', 'June': 'Jun', 'July': 'Jul', 'August': 'Aug',
    //     'September': 'Sep', 'October': 'Oct', 'November': 'Nov', 'December': 'Dec'
    //   };
    //   return monthMap[fullMonthName] || fullMonthName;
    // }

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
    // const startStr = '2026-06-15 00:00:00'; // Hardcoded for testing
    const endStr = formatDateForSQL(nextYear);



    // ─── FIX: Use parameterized query to prevent SQL injection ───
    const redemptionData = await prisma.$queryRawUnsafe(`
      SELECT
        MONTH(maturity_date) AS month,
        MONTHNAME(maturity_date) AS label,
        YEAR(maturity_date) AS year,
        ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
        COUNT(DISTINCT isin) AS isin_count
      FROM master_issuer
      WHERE maturity_date BETWEEN ? AND ? AND (is_visible = 1)
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
      FROM master_issuer
      WHERE maturity_date BETWEEN ? AND ? AND (is_visible = 1)
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

    // ─── Build dynamic filter conditions ───
    const conditions = [];
    const params = [];

    conditions.push(`i.allotment_date BETWEEN ? AND ?  AND (is_visible = 1)`);
    params.push(cyStart, cyEnd);

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }
    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }
    if (dealSize) {
      conditions.push(`i.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }
    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      params.push(listingStatus);
    }
    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      params.push(seniority);
    }
    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      params.push(taxFree);
    }
    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      params.push(securedFlag);
    }
    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      params.push(sector);
    }
    if (trustee) {
      conditions.push(`master_trustee.short_name = ?`);
      params.push(trustee);
    }
    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      params.push(nature);
    }
    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      params.push(ownershipType);
    }
    if (creditRatingAgency) {
      conditions.push(`ma.short_name = ?`);
      params.push(creditRatingAgency);
    }
    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      params.push(securityType);
    }
    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      params.push(modeOfIssue);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ─── FIX: Calculate filtered total, not unfiltered total ───
    const totalQuery = `
      SELECT COUNT(DISTINCT mir.id) as aggregate 
      FROM master_issuer_rating mir
      INNER JOIN master_agency ma ON ma.id = mir.agency_id
      INNER JOIN master_issuer i ON i.id = mir.issuer_id
      LEFT JOIN issuer_details ON issuer_details.id = i.issuer_master_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = i.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = i.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = i.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = i.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = i.id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = i.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = i.issuer_ownership_type
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
      ) AS listing_data ON listing_data.issuer_id = i.id
      ${whereClause}
    `;

    const totalResult = await prisma.$queryRawUnsafe(totalQuery, ...params);
    const totalRatingNo = Number(totalResult[0]?.aggregate) || 0;

    // ─── Base joins needed for filters ───
    const baseJoins = `
      INNER JOIN master_issuer i ON i.id = mir.issuer_id
      LEFT JOIN issuer_details ON issuer_details.id = i.issuer_master_id
      LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = i.seniority
      LEFT JOIN master_tax_free ON master_tax_free.code = i.tax_free
      LEFT JOIN master_secured_flag ON master_secured_flag.code = i.secured_flag
      LEFT JOIN master_business_sector ON master_business_sector.code = i.business_sector
      LEFT JOIN issuer_trustee ON issuer_trustee.issuer_id = i.id
      LEFT JOIN master_trustee ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = i.nature_type
      LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = i.issuer_ownership_type
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
      ) AS listing_data ON listing_data.issuer_id = i.id
    `;

    let mainQuery = '';
    const mainParams = [...params];

    if (isDrillDown) {
      // Drill-down by agency: group by individual rating
      mainQuery = `
        SELECT 
          ma.short_name as label, 
          COUNT(DISTINCT mir.id) as rating_no,
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
          COUNT(DISTINCT mir.id) as rating_no,
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
    issuerName = "",
    rating = "",
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
    modeOfIssue = ""
  } = req.body;

  try {
    // ─── Validate and sanitize inputs ───
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 25, 1), 1000); // Cap at 1000
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

    const cyStart = formatDateForSQL(currentStartDate);
    const cyEnd = formatDateForSQL(currentEndDate);

    // ─── Build dynamic filter conditions ───
    const conditions = [];
    const params = [];

    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ? AND (master_issuer.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }
    if (rating) {
      conditions.push(`master_issuer_rating.rating = ?`);
      params.push(rating);
    }
    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }
    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      params.push(listingStatus);
    }
    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      params.push(seniority);
    }
    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      params.push(taxFree);
    }
    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      params.push(securedFlag);
    }
    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      params.push(sector);
    }
    if (trustee) {
      conditions.push(`master_trustee.short_name = ?`);
      params.push(trustee);
    }
    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      params.push(nature);
    }
    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      params.push(ownershipType);
    }
    if (creditRatingAgency) {
      conditions.push(`master_agency.short_name = ?`);
      params.push(creditRatingAgency);
    }
    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      params.push(securityType);
    }
    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      params.push(modeOfIssue);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // ─── Shared base joins (used by both data and count queries) ───
    const baseJoins = `
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = master_issuer.id
      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN issuer_details 
        ON issuer_details.id = master_issuer.issuer_master_id
      LEFT JOIN master_security_type 
        ON master_security_type.code = master_issuer.security_class
      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue
      LEFT JOIN issuer_coupon_details 
        ON issuer_coupon_details.issuer_id = master_issuer.id
      LEFT JOIN master_issuer_rating 
        ON master_issuer_rating.issuer_id = master_issuer.id
      LEFT JOIN master_agency 
        ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN issuer_trustee 
        ON issuer_trustee.issuer_id = master_issuer.id
      LEFT JOIN master_trustee 
        ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN issuer_registrar 
        ON issuer_registrar.issuer_id = master_issuer.id
      LEFT JOIN master_registrar 
        ON master_registrar.id = issuer_registrar.registrar_id
      LEFT JOIN issuer_arranger 
        ON issuer_arranger.issuer_id = master_issuer.id
      LEFT JOIN master_arranger 
        ON master_arranger.id = issuer_arranger.arranger_id
      LEFT JOIN master_seniority_tier_classification 
        ON master_seniority_tier_classification.code = master_issuer.seniority
      LEFT JOIN master_tax_free 
        ON master_tax_free.code = master_issuer.tax_free
      LEFT JOIN master_secured_flag 
        ON master_secured_flag.code = master_issuer.secured_flag
      LEFT JOIN master_business_sector 
        ON master_business_sector.code = master_issuer.business_sector
    `;

    // ─── FIX: Use DISTINCT in data query to prevent row multiplication from joins ───
    const dataQuery = `
      SELECT DISTINCT
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,
        issuer_details.issuer_name AS issuer_name,
        listing_data.listing_status AS listing_status,
        master_issuer_type_nature.description AS nature,
        master_issuer_ownership_type.description AS ownership_type,
        master_security_type.description AS security_type,
        master_mode_issue.description AS mode_of_issue,
        issuer_coupon_details.coupon_rate,
        master_issuer_rating.rating AS credit_rating,
        master_agency.short_name AS credit_rating_agency,
        master_trustee.short_name AS debenture_trustee,
        master_registrar.registrar_name AS registrar,
        master_arranger.short_name AS arranger,
        master_seniority_tier_classification.description AS seniority,
        master_tax_free.description AS tax_free,
        master_secured_flag.description AS secured_flag,
        master_business_sector.description AS sector
      FROM master_issuer
      ${baseJoins}
      ${whereClause}
      ORDER BY master_issuer.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // ─── Count query using same joins ───
    const countQuery = `
      SELECT COUNT(DISTINCT master_issuer.id) as total
      FROM master_issuer
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
        // ─── FIX: Use ?? instead of || to preserve 0 values ───
        issueSize: item?.issue_size ?? null,
        faceValue: item?.face_value ?? null,
        // ─── FIX: Use timezone-safe date extraction ───
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        // ─── FIX: Preserve 0 coupon rate ───
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

    // Return data with pagination info
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
        FROM master_issuer
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
        FROM master_issuer
        LEFT JOIN master_issuer_ownership_type
          ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
        WHERE master_issuer_ownership_type.description IS NOT NULL;
      `);
    const sectorOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_business_sector.description AS sector
        FROM master_issuer
        LEFT JOIN master_business_sector 
          ON master_business_sector.code = master_issuer.business_sector
        WHERE 
        master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_business_sector.description IS NOT NULL;
      `);
    const securityTypeOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_security_type.description AS security_type
        FROM master_issuer
        LEFT JOIN master_security_type 
          ON master_security_type.code = master_issuer.security_class
        WHERE master_security_type.description IS NOT NULL;
      `);
    const modeissueOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_mode_issue.description AS mode_of_issue
        FROM master_issuer
        LEFT JOIN master_mode_issue
          ON master_mode_issue.code = master_issuer.mode_issue
        WHERE master_mode_issue.description IS NOT NULL;
      `);

    const creditRatingOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_issuer_rating.rating AS credit_rating
        FROM master_issuer
        LEFT JOIN master_issuer_rating 
          ON master_issuer_rating.issuer_id = master_issuer.id
        WHERE 
        master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_issuer_rating.rating IS NOT NULL;
      `);
    const creditRatingAgencyOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_agency.short_name AS credit_rating_agency
        FROM master_issuer
        LEFT JOIN master_issuer_rating 
          ON master_issuer_rating.issuer_id = master_issuer.id
        LEFT JOIN master_agency 
          ON master_agency.id = master_issuer_rating.agency_id
        WHERE 
         master_agency.short_name IS NOT NULL;
      `);

    const seniorityOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_seniority_tier_classification.description AS Seniority
        FROM master_issuer
        LEFT JOIN master_seniority_tier_classification 
          ON master_seniority_tier_classification.code = master_issuer.seniority
        WHERE 
        master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_seniority_tier_classification.description IS NOT NULL;
      `);

    const securedFlagOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_secured_flag.description AS secured_flag
        FROM master_issuer
        LEFT JOIN master_secured_flag 
          ON master_secured_flag.code = master_issuer.secured_flag
        WHERE 
        master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
        AND master_secured_flag.description IS NOT NULL;
      `);
    const taxFreeOptions = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT master_tax_free.description AS tax_free
        FROM master_issuer
        LEFT JOIN master_tax_free 
          ON master_tax_free.code = master_issuer.tax_free
        WHERE 
        master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
      FROM master_issuer AS i
      WHERE i.maturity_date BETWEEN ? AND ?
        AND i.is_visible = 1
    `;

    const count = await prisma.$queryRawUnsafe(countQuery, startDate, endDate);

    // ── DATA QUERY ──
    const dataQuery = `
      SELECT 
          MIN(i.id) AS id,
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
              WHERE mise.issuer_id = i.id
              ORDER BY mise.listing_status
              LIMIT 1
          )) AS listingStatus
      FROM master_issuer AS i
      LEFT JOIN issuer_details AS id ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi ON i.mode_issue = mi.code
      LEFT JOIN issuer_coupon_details AS icd ON i.id = icd.issuer_id
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf ON msf.code = i.secured_flag
      LEFT JOIN issuer_arranger AS ia ON i.id = ia.issuer_id
      LEFT JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      LEFT JOIN issuer_trustee AS it ON i.id = it.issuer_id
      LEFT JOIN master_trustee AS mt ON it.trustee_id = mt.id
      LEFT JOIN issuer_registrar AS ir1 ON i.id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr ON ir1.registrar_id = mr.id
      LEFT JOIN master_issuer_rating AS mir ON i.id = mir.issuer_id
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
      endDate = '2026-03-31',
      ownershipType = "",
      sector = "",
      nature = "",
      securityType = "",
      creditRatingAgency = "",
      modeOfIssue = "",
      seniority = "",
      taxFree = "",
      listingStatus = "",
      securedFlag = "",
      rating = "",
      dealSize = ""
    } = req.body;

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

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }

    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (ownershipType) {
      conditions.push(`miot.description = ?`);
      params.push(ownershipType);
    }

    if (sector) {
      conditions.push(`mbs.description = ?`);
      params.push(sector);
    }

    if (nature) {
      conditions.push(`mint.description = ?`);
      params.push(nature);
    }

    if (securityType) {
      conditions.push(`mst.description = ?`);
      params.push(securityType);
    }

    if (creditRatingAgency) {
      conditions.push(`ma.short_name = ?`);
      params.push(creditRatingAgency);
    }

    if (modeOfIssue) {
      conditions.push(`mmi.description = ?`);
      params.push(modeOfIssue);
    }

    if (seniority) {
      conditions.push(`mstc.description = ?`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`mtf.description = ?`);
      params.push(taxFree);
    }

    if (listingStatus) {
      conditions.push(`mls.description = ?`);
      params.push(listingStatus);
    }

    if (securedFlag) {
      conditions.push(`msf.description = ?`);
      params.push(securedFlag);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
       FIXED VERSION
    --------------------------------- */
    const query = `
      SELECT
        MONTH(fi.allotment_date) AS issue_month_no,
        MONTHNAME(fi.allotment_date) AS issue_month,
        COUNT(DISTINCT fi.isin) AS no_of_issue,
        IF(
          SUM(fi.issue_size) > 0,
          ROUND(SUM(fi.issue_size) / 10000000, 2),
          0
        ) AS issue_size,
        SUM(fi.issue_size) AS actual_issue_size
      FROM (
        SELECT DISTINCT
          mi.id,
          mi.isin,
          mi.issue_size,
          mi.allotment_date
        FROM master_issuer mi
        LEFT JOIN issuer_details
          ON issuer_details.id = mi.issuer_master_id
        LEFT JOIN master_issuer_ownership_type miot
          ON miot.code = mi.issuer_ownership_type
        LEFT JOIN master_business_sector mbs
          ON mbs.code = mi.business_sector
        LEFT JOIN master_issuer_type_nature mint
          ON mint.code = mi.nature_type
        LEFT JOIN master_security_type mst
          ON mst.code = mi.security_class
        LEFT JOIN master_issuer_rating mir
          ON mir.issuer_id = mi.id
        LEFT JOIN master_agency ma
          ON ma.id = mir.agency_id
          AND ma.parent_id = 0
        LEFT JOIN master_mode_issue mmi
          ON mmi.code = mi.mode_issue
        LEFT JOIN master_seniority_tier_classification mstc
          ON mstc.code = mi.seniority
        LEFT JOIN master_tax_free mtf
          ON mtf.code = mi.tax_free
        LEFT JOIN master_issuer_stock_exchange mise
          ON mise.issuer_id = mi.id
        LEFT JOIN master_listing_status mls
          ON mls.code = mise.listing_status
        LEFT JOIN master_secured_flag msf
          ON msf.code = mi.secured_flag
        ${whereClause}
      ) AS fi
      GROUP BY
        MONTH(fi.allotment_date),
        MONTHNAME(fi.allotment_date)
      ORDER BY
        MONTH(fi.allotment_date) ASC
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
      endDate = '2026-05-28',
      limit = 25,
      offset = 0,
      issuerName = "",
      rating = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      trustee = "",
      creditRatingAgency = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      arranger = "",
      registrar = "",
      isin = ""
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
    // BUILD DYNAMIC CONDITIONS
    // =========================

    const conditions = [];
    const params = [];

    conditions.push(`i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)`);
    params.push(cyStart, cyEnd);

    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (isin) {
      conditions.push(`i.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }

    if (seniority) {
      conditions.push(`mstc.description = ?`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`tf.description = ?`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`msf.description = ?`);
      params.push(securedFlag);
    }

    if (trustee) {
      conditions.push(`mt.short_name = ?`);
      params.push(trustee);
    }

    if (creditRatingAgency) {
      conditions.push(`mag.short_name = ?`);
      params.push(creditRatingAgency);
    }

    // ─── FIX: listingStatus using JOIN instead of EXISTS subquery ───
    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      params.push(listingStatus);
    }

    if (securityType) {
      conditions.push(`s.description = ?`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`mi.description = ?`);
      params.push(modeOfIssue);
    }

    if (arranger) {
      conditions.push(`ma.short_name = ?`);
      params.push(arranger);
    }

    if (registrar) {
      conditions.push(`mr.short_name = ?`);
      params.push(registrar);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ─── Shared listing data subquery ───
    const listingDataJoin = `
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          MAX(mls.description) AS listing_status
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data ON listing_data.issuer_id = i.id
    `;

    // ─── Shared base joins ───
    const baseJoins = `
      LEFT JOIN issuer_details AS id
        ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s
        ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi
        ON i.mode_issue = mi.code
      LEFT JOIN issuer_coupon_details AS icd
        ON i.id = icd.issuer_id
      LEFT JOIN master_seniority_tier_classification AS mstc
        ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf
        ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf
        ON msf.code = i.secured_flag
      LEFT JOIN issuer_arranger AS ia
        ON i.id = ia.issuer_id
      LEFT JOIN master_arranger AS ma
        ON ia.arranger_id = ma.id
      LEFT JOIN issuer_trustee AS it
        ON i.id = it.issuer_id
      LEFT JOIN master_trustee AS mt
        ON it.trustee_id = mt.id
      LEFT JOIN issuer_registrar AS ir1
        ON i.id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr
        ON ir1.registrar_id = mr.id
      LEFT JOIN master_issuer_rating AS mir
        ON i.id = mir.issuer_id
      LEFT JOIN master_agency AS mag
        ON mag.id = mir.agency_id
      ${listingDataJoin}
    `;

    // =========================
    // DATA QUERY
    // =========================

    // ─── FIX: Removed all_months, proper GROUP BY, ORDER BY on GROUP_CONCAT ───
    const dataQuery = `
      SELECT
        i.id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        i.maturity_date,
        icd.coupon_rate,
        mt.short_name AS debenture_trustee_name,
        mr.short_name AS registrar_detail,
        GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC) AS rating,
        ma.short_name AS arranger_name,
        i.security_name,
        s.description AS security_type,
        mi.description AS mode_issue,
        i.issue_size,
        i.face_value,
        GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC) AS agency_name,
        mstc.description AS seniority,
        tf.description AS tax_free,
        msf.description AS secured_flag,
        listing_data.listing_status
      FROM master_issuer AS i
      ${baseJoins}
      ${whereClause}
      GROUP BY
        i.id, i.isin, id.issuer_name, i.allotment_date, i.maturity_date,
        icd.coupon_rate, mt.short_name, mr.short_name, ma.short_name,
        i.security_name, s.description, mi.description, i.issue_size,
        i.face_value, mstc.description, tf.description, msf.description,
        listing_data.listing_status
      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY
    // =========================

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.isin
        FROM master_issuer AS i
        ${baseJoins}
        ${whereClause}
        GROUP BY i.isin
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
        // ─── FIX: Timezone-safe date extraction ───
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        // ─── FIX: Preserve 0 coupon rate ───
        couponRate: item?.coupon_rate !== null && item?.coupon_rate !== undefined ? item.coupon_rate : '-',
        // ─── FIX: Use ?? to preserve 0 values ───
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
      ) AS listing_data ON listing_data.issuer_id = master_issuer.id
    `;

    const resultQuery = `
      SELECT DISTINCT
        master_issuer.isin,
        master_issuer.series,
        master_issuer.convertible_flag,
        master_issuer.option_flag,
        master_issuer.tier_classification,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,
        master_issuer.call_desc,
        master_issuer.put_desc,
        master_issuer.isin_desc,
        master_issuer.convertible_details,
        master_issuer.stipulation_details,
        master_issuer.guaranteed,
        master_issuer.if_taxable,
        master_issuer.allotment_qty,
        master_issuer.stepupdwnbasis,
        master_issuer.stepupdwndtls,
        master_issuer.call_option,
        master_issuer.put_option,
        master_issuer.infra_category,
        master_issuer.issue_price,
        master_issuer.fintrpydte,
        master_issuer.freq,
        master_issuer.freq_dis,
        master_issuer.next_sch_date,
        master_issuer.intratupto,
        master_issuer.intratlkto,
        master_issuer.created_by,
        master_issuer.created_at,
        master_issuer.updated_by,
        master_issuer.updated_at,
        master_interest_type.description AS interest_type,
        master_perpetual_nature_indicator.description AS perpetual_nature,
        master_security_status.description AS security_status,
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
      FROM master_issuer
      ${listingDataJoin}
      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type
      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type
      LEFT JOIN issuer_details 
        ON issuer_details.id = master_issuer.issuer_master_id
      LEFT JOIN master_day_count 
        ON master_day_count.code = master_issuer.day_count
      LEFT JOIN master_frequency 
        ON master_frequency.code = master_issuer.compound_frequency
      LEFT JOIN master_cra_status 
        ON master_cra_status.code = master_issuer.rated_flag
      LEFT JOIN master_convertible_type_a 
        ON master_convertible_type_a.code = master_issuer.convertible_type_a
      LEFT JOIN master_convertible_type_b
        ON master_convertible_type_b.code = master_issuer.convertible_type_b
      LEFT JOIN master_guaranteed_type 
        ON master_guaranteed_type.code = master_issuer.guaranteed_type
      LEFT JOIN master_perpetual_nature_indicator 
        ON master_perpetual_nature_indicator.code = master_issuer.perpetual_nature
      LEFT JOIN master_interest_type 
        ON master_interest_type.code = master_issuer.interest_type
      LEFT JOIN master_security_status 
        ON master_security_status.code = master_issuer.security_status
      LEFT JOIN master_security_type 
        ON master_security_type.code = master_issuer.security_class
      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue
      LEFT JOIN issuer_coupon_details 
        ON issuer_coupon_details.issuer_id = master_issuer.id
      LEFT JOIN master_issuer_rating 
        ON master_issuer_rating.issuer_id = master_issuer.id
      LEFT JOIN master_agency 
        ON master_agency.id = master_issuer_rating.agency_id
      LEFT JOIN issuer_trustee 
        ON issuer_trustee.issuer_id = master_issuer.id
      LEFT JOIN master_trustee 
        ON master_trustee.id = issuer_trustee.trustee_id
      LEFT JOIN issuer_registrar 
        ON issuer_registrar.issuer_id = master_issuer.id
      LEFT JOIN master_registrar 
        ON master_registrar.id = issuer_registrar.registrar_id
      LEFT JOIN issuer_arranger 
        ON issuer_arranger.issuer_id = master_issuer.id
      LEFT JOIN master_arranger 
        ON master_arranger.id = issuer_arranger.arranger_id
      LEFT JOIN master_seniority_tier_classification 
        ON master_seniority_tier_classification.code = master_issuer.seniority
      LEFT JOIN master_tax_free 
        ON master_tax_free.code = master_issuer.tax_free
      LEFT JOIN master_secured_flag 
        ON master_secured_flag.code = master_issuer.secured_flag
      LEFT JOIN master_business_sector 
        ON master_business_sector.code = master_issuer.business_sector
      WHERE master_issuer.id IN (${idPlaceholders})
      ORDER BY master_issuer.allotment_date ASC
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

    /* ---------------- DYNAMIC FILTER BUILDER ---------------- */
    const buildFilterConditions = (tableAlias = 'mi') => {
      const conditions = [];
      const params = [];

      if (rating) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency ma2 ON ma2.id = mir2.agency_id
          WHERE mir2.issuer_id = ${tableAlias}.id AND mir2.rating = ?
        )`);
        params.push(rating);
      }

      if (creditRatingAgency) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir2
          JOIN master_agency ma2 ON ma2.id = mir2.agency_id
          WHERE mir2.issuer_id = ${tableAlias}.id AND ma2.short_name = ?
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

      if (nature) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_type_nature mitn2
          WHERE mitn2.code = ${tableAlias}.nature_type AND mitn2.description = ?
        )`);
        params.push(nature);
      }

      if (ownershipType) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_ownership_type miot2
          WHERE miot2.code = ${tableAlias}.issuer_ownership_type AND miot2.description = ?
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
      SELECT SUM(mi.issue_size) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT SUM(mi.issue_size) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, pyStart, pyEnd, ...filterParams);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS aggregate
      FROM master_issuer mi
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
          t1.issuer_name,
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
            ma.short_name AS issuer_name,
            COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
              ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
          t1.issuer_name,
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
            ma.short_name AS issuer_name,
            COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
            ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
            RANK() OVER (
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
      SELECT COUNT(DISTINCT ia.arranger_id) AS total
      FROM master_issuer mi
      JOIN issuer_arranger ia ON ia.issuer_id = mi.id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${filterSql}
    `, cyStart, cyEnd, ...filterParams);

    const totalRecords = parseInt(totalCountResult[0]?.total) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedArrangersSubQuery =
      issueType === 'count'
        ? `
          SELECT
            ma.id AS arranger_id,
            ma.short_name AS arranger_name,
            RANK() OVER (
              ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
              ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC
            ) AS arr_rank
          FROM master_issuer mi
          JOIN issuer_arranger ia ON ia.issuer_id = mi.id
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
        r.arranger_name AS issuer_name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedArrangersSubQuery}) r
      JOIN issuer_arranger ia ON ia.arranger_id = r.arranger_id
      JOIN master_issuer mi ON mi.id = ia.issuer_id
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
      name: item.issuer_name ?? '-',
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

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    const cyStart = formatDate(currentStartDate);
    const cyEnd = formatDate(currentEndDate);

    // Fix: Validate id properly
    const safeId = id !== undefined && id !== null && id !== '' ? Number(id) : null;
    const hasId = safeId !== null && !isNaN(safeId) && safeId > 0;

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

      if (nature) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_type_nature mitn2
          WHERE mitn2.code = ${tableAlias}.nature_type AND mitn2.description = ?
        )`);
        params.push(nature);
      }

      if (ownershipType) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_ownership_type miot2
          WHERE miot2.code = ${tableAlias}.issuer_ownership_type AND miot2.description = ?
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

    /* ---------------- TOTALS (percentage denominator) ---------------- */
    const totalRatingQuery = `
      SELECT COUNT(master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      INNER JOIN master_issuer i ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger ON issuer_arranger.issuer_id = i.id
      INNER JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
        ${hasId ? 'AND master_agency.id = ?' : ''}
        ${filterSql}
    `;

    const totalRatingParams = [cyStart, cyEnd];
    if (hasId) totalRatingParams.push(safeId);
    totalRatingParams.push(...filterParams);

    const totalRatingResult = await prisma.$queryRawUnsafe(totalRatingQuery, ...totalRatingParams);
    const totalRatingCount = Number(totalRatingResult[0]?.aggregate) || 0;
    const totalRatingNo = totalRatingCount || 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    // Fix: When hasId is false (grouping by agency), we can't select individual rating
    // because one agency can have multiple ratings. We aggregate ratings with GROUP_CONCAT.
    // When hasId is true (specific agency selected), we group by rating and show each rating.
    const creditRatingQuery = hasId
      ? `
        SELECT
          master_agency.short_name AS label,
          ROUND(
            (COUNT(master_issuer_rating.rating) / ?) * 100,
            2
          ) AS percentage,
          COUNT(master_issuer_rating.id) AS rating_no,
          CONCAT(
            '#',
            SUBSTRING(
              LPAD(
                HEX(
                  MOD(
                    ABS(CAST(CONV(SUBSTRING(MD5(CONCAT(master_agency.short_name, '-', master_issuer_rating.rating)), 1, 8), 16, 10) AS SIGNED)),
                    16777215
                  )
                ),
                6,
                '0'
              ),
              -6
            )
          ) AS color,
          master_issuer_rating.rating
        FROM master_agency
        INNER JOIN master_issuer_rating
          ON master_issuer_rating.agency_id = master_agency.id
        INNER JOIN master_issuer AS i
          ON i.id = master_issuer_rating.issuer_id
        INNER JOIN issuer_arranger
          ON issuer_arranger.issuer_id = i.id
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          AND master_agency.id = ?
          ${filterSql}
        GROUP BY master_issuer_rating.rating, master_agency.short_name
        ORDER BY percentage DESC, rating_no DESC
      `
      : `
        SELECT
          master_agency.short_name AS label,
          ROUND(
            (COUNT(master_issuer_rating.rating) / ?) * 100,
            2
          ) AS percentage,
          COUNT(master_issuer_rating.id) AS rating_no,
          CONCAT(
            '#',
            SUBSTRING(
              LPAD(
                HEX(
                  MOD(
                    ABS(CAST(CONV(SUBSTRING(MD5(master_agency.short_name), 1, 8), 16, 10) AS SIGNED)),
                    16777215
                  )
                ),
                6,
                '0'
              ),
              -6
            )
          ) AS color,
          GROUP_CONCAT(DISTINCT master_issuer_rating.rating ORDER BY master_issuer_rating.rating ASC SEPARATOR ', ') AS rating
        FROM master_agency
        INNER JOIN master_issuer_rating
          ON master_issuer_rating.agency_id = master_agency.id
        INNER JOIN master_issuer AS i
          ON i.id = master_issuer_rating.issuer_id
        INNER JOIN issuer_arranger
          ON issuer_arranger.issuer_id = i.id
        WHERE i.allotment_date BETWEEN ? AND ? AND (i.is_visible = 1)
          ${filterSql}
        GROUP BY master_agency.id, master_agency.short_name
        ORDER BY percentage DESC, rating_no DESC
      `;

    const creditRatingParams = [totalRatingNo, cyStart, cyEnd];
    if (hasId) creditRatingParams.push(safeId);
    creditRatingParams.push(...filterParams);

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery, ...creditRatingParams);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: totalRatingCount === 0 ? 0 : (Number(item?.percentage) || 0),
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
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

      if (nature) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_type_nature mitn2
          WHERE mitn2.code = ${tableAlias}.nature_type AND mitn2.description = ?
        )`);
        params.push(nature);
      }

      if (ownershipType) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_ownership_type miot2
          WHERE miot2.code = ${tableAlias}.issuer_ownership_type AND miot2.description = ?
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
        i.id AS issuerId,
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
          WHERE mise.issuer_id = i.id
          ORDER BY mise.listing_status ASC, mise.id ASC
          LIMIT 1
        ) AS listing_status,
        i.issuer_master_id
      FROM master_issuer AS i
      LEFT JOIN issuer_details AS id ON i.issuer_master_id = id.id
      LEFT JOIN master_security_type AS s ON i.security_class = s.code
      LEFT JOIN master_mode_issue AS mi ON i.mode_issue = mi.code
      LEFT JOIN issuer_coupon_details AS icd ON i.id = icd.issuer_id
      LEFT JOIN master_seniority_tier_classification AS mstc ON mstc.code = i.seniority
      LEFT JOIN master_tax_free AS tf ON tf.code = i.tax_free
      LEFT JOIN master_secured_flag AS msf ON msf.code = i.secured_flag
      LEFT JOIN issuer_trustee AS it ON i.id = it.issuer_id
      LEFT JOIN master_trustee AS mt ON it.trustee_id = mt.id
      LEFT JOIN issuer_registrar AS ir1 ON i.id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr ON ir1.registrar_id = mr.id
      LEFT JOIN master_issuer_rating AS mir ON i.id = mir.issuer_id
      LEFT JOIN master_agency AS mag ON mag.id = mir.agency_id
      INNER JOIN issuer_arranger AS ia ON i.id = ia.issuer_id
      INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      WHERE ia.arranger_id = ?
        AND i.allotment_date BETWEEN ? AND ?
        ${filterSql}
      GROUP BY
        i.id,
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
      SELECT COUNT(DISTINCT i.id) AS total
      FROM master_issuer AS i
      INNER JOIN issuer_arranger AS ia ON i.id = ia.issuer_id
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
  const {
    startDate = '2025-04-01',
    endDate = '2026-03-31',
    limit = 25,
    offset = 0,
    issuerName = "",
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

  try {
    // Fix: Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Fix: Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 25));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // ---------------------
    // Dynamic WHERE conditions
    // ---------------------
    const conditions = [];
    const params = [];

    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(startDate, endDate);

    // Fix: Use EXISTS for arranger check to avoid JOIN duplication issues
    conditions.push(`
      EXISTS (
        SELECT 1 
        FROM issuer_arranger ia 
        WHERE ia.issuer_id = mi.id
      )
    `);

    // ---------------------
    // Filters (using EXISTS to prevent JOIN duplication)
    // ---------------------
    if (issuerName) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_details id2 
        WHERE id2.id = mi.issuer_master_id AND id2.issuer_name LIKE ?
      )`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        WHERE mir2.issuer_id = mi.id AND mir2.rating = ?
      )`);
      params.push(rating);
    }

    if (creditRatingAgency) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2 
        JOIN master_agency mag2 ON mag2.id = mir2.agency_id
        WHERE mir2.issuer_id = mi.id AND mag2.short_name = ?
      )`);
      params.push(creditRatingAgency);
    }

    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2
        JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
        WHERE mise2.issuer_id = mi.id AND mls2.description = ?
      )`);
      params.push(listingStatus);
    }

    if (seniority) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_seniority_tier_classification mstc2
        WHERE mstc2.code = mi.seniority AND mstc2.description = ?
      )`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_tax_free mtf2
        WHERE mtf2.code = mi.tax_free AND mtf2.description = ?
      )`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_secured_flag msf2
        WHERE msf2.code = mi.secured_flag AND msf2.description = ?
      )`);
      params.push(securedFlag);
    }

    if (sector) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_business_sector mbs2
        WHERE mbs2.code = mi.business_sector AND mbs2.description = ?
      )`);
      params.push(sector);
    }

    if (trustee) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
        WHERE it2.issuer_id = mi.id AND mt2.short_name = ?
      )`);
      params.push(trustee);
    }

    if (nature) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_type_nature mitn2
        WHERE mitn2.code = mi.nature_type AND mitn2.description = ?
      )`);
      params.push(nature);
    }

    if (ownershipType) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_ownership_type miot2
        WHERE miot2.code = mi.issuer_ownership_type AND miot2.description = ?
      )`);
      params.push(ownershipType);
    }

    if (securityType) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_security_type mst2
        WHERE mst2.code = mi.security_class AND mst2.description = ?
      )`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_mode_issue mmi2
        WHERE mmi2.code = mi.mode_issue AND mmi2.description = ?
      )`);
      params.push(modeOfIssue);
    }

    if (isin) {
      conditions.push(`mi.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (arranger) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia2
        JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
        WHERE ia2.issuer_id = mi.id AND ma2.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    if (registrar) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir2
        JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
        WHERE ir2.issuer_id = mi.id AND mr2.registrar_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // ---------------------
    // Main data query
    // ---------------------
    // Fix: Removed all LEFT JOINs that cause M×N duplication
    // Fix: Use subqueries/aggregations for one-to-many relationships
    // Fix: Corrected issuer_coupon_details join to use mi.id instead of issuer_details.id
    const dataQuery = `
      SELECT
        mi.id,
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

        icd.coupon_rate,

        mstc.description AS seniority,
        mtf.description AS tax_free,
        msf.description AS secured_flag,

        -- Fix: Aggregate arrangers to prevent duplication
        GROUP_CONCAT(DISTINCT ma.short_name ORDER BY ma.short_name ASC SEPARATOR ', ') AS Arranger,

        -- Fix: Aggregate ratings and agencies
        GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') AS credit_rating,
        GROUP_CONCAT(DISTINCT mag.short_name ORDER BY mag.short_name ASC SEPARATOR ', ') AS credit_rating_agency,

        -- Fix: Aggregate trustees
        GROUP_CONCAT(DISTINCT mt.short_name ORDER BY mt.short_name ASC SEPARATOR ', ') AS debenture_trustee,

        -- Fix: Aggregate registrars
        GROUP_CONCAT(DISTINCT mr.registrar_name ORDER BY mr.registrar_name ASC SEPARATOR ', ') AS Registrar,

        -- Fix: Deterministic listing status (first by status code, then by id)
        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          INNER JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.id
          ORDER BY mise.listing_status ASC, mise.id ASC
          LIMIT 1
        ) AS listing_status

      FROM master_issuer mi

      LEFT JOIN issuer_details id ON id.id = mi.issuer_master_id
      LEFT JOIN master_issuer_ownership_type miot ON miot.code = mi.issuer_ownership_type
      LEFT JOIN master_issuer_type_nature mitn ON mitn.code = mi.nature_type
      LEFT JOIN master_business_sector mbs ON mbs.code = mi.business_sector
      LEFT JOIN master_security_type mst ON mst.code = mi.security_class
      LEFT JOIN master_mode_issue mmi ON mmi.code = mi.mode_issue
      LEFT JOIN issuer_coupon_details icd ON icd.issuer_id = mi.id
      LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = mi.seniority
      LEFT JOIN master_tax_free mtf ON mtf.code = mi.tax_free
      LEFT JOIN master_secured_flag msf ON msf.code = mi.secured_flag

      -- One-to-many relationships: use LEFT JOIN but GROUP BY mi.id
      LEFT JOIN issuer_arranger ia ON ia.issuer_id = mi.id
      LEFT JOIN master_arranger ma ON ma.id = ia.arranger_id

      LEFT JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      LEFT JOIN master_agency mag ON mag.id = mir.agency_id

      LEFT JOIN issuer_trustee it ON it.issuer_id = mi.id
      LEFT JOIN master_trustee mt ON mt.id = it.trustee_id

      LEFT JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id

      ${whereClause}

      GROUP BY
        mi.id,
        mi.isin,
        mi.security_name,
        mi.issue_size,
        mi.face_value,
        mi.allotment_date,
        mi.maturity_date,
        id.issuer_name,
        miot.description,
        mitn.description,
        mbs.description,
        mst.description,
        mmi.description,
        icd.coupon_rate,
        mstc.description,
        mtf.description,
        msf.description

      ORDER BY mi.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ---------------------
    // Count query
    // ---------------------
    const countQuery = `
      SELECT COUNT(DISTINCT mi.id) AS total
      FROM master_issuer mi
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
        taxFree: item?.tax_free || '-',
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
      data: finalResult,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: (safeOffset + safeLimit) < total
      }
    });

  } catch (error) {
    console.error(error);
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
      endDate = '2026-03-31',

      ownershipType = "",
      sector = "",
      nature = "",
      securityType = "",
      creditRatingAgency = "",
      modeOfIssue = "",
      seniority = "",
      taxFree = "",
      listingStatus = "",
      securedFlag = "",
      rating = "",
      dealSize = "",

      // optional arranger filter
      arranger = ""
    } = req.body;

    // Fix: Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    /* ---------------------------------
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */

    const conditions = [];
    const params = [];

    // Base date filter
    conditions.push(`mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)`);
    params.push(startDate, endDate);

    // Fix: Use EXISTS subqueries for filters to prevent JOIN duplication
    // and avoid turning LEFT JOINs into effective INNER JOINs

    // Rating
    if (rating) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2
        WHERE mir2.issuer_id = mi.id AND mir2.rating = ?
      )`);
      params.push(rating);
    }

    // Deal Size
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    // Ownership Type
    if (ownershipType) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_ownership_type miot2
        WHERE miot2.code = mi.issuer_ownership_type AND miot2.description = ?
      )`);
      params.push(ownershipType);
    }

    // Sector
    if (sector) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_business_sector mbs2
        WHERE mbs2.code = mi.business_sector AND mbs2.description = ?
      )`);
      params.push(sector);
    }

    // Nature
    if (nature) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_type_nature mint2
        WHERE mint2.code = mi.nature_type AND mint2.description = ?
      )`);
      params.push(nature);
    }

    // Security Type
    if (securityType) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_security_type mst2
        WHERE mst2.code = mi.security_class AND mst2.description = ?
      )`);
      params.push(securityType);
    }

    // Credit Rating Agency
    if (creditRatingAgency) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2
        JOIN master_agency mag2 ON mag2.id = mir2.agency_id AND mag2.parent_id = 0
        WHERE mir2.issuer_id = mi.id AND mag2.short_name = ?
      )`);
      params.push(creditRatingAgency);
    }

    // Mode Of Issue
    if (modeOfIssue) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_mode_issue mmi2
        WHERE mmi2.code = mi.mode_issue AND mmi2.description = ?
      )`);
      params.push(modeOfIssue);
    }

    // Seniority
    if (seniority) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_seniority_tier_classification mstc2
        WHERE mstc2.code = mi.seniority AND mstc2.description = ?
      )`);
      params.push(seniority);
    }

    // Tax Free
    if (taxFree) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_tax_free mtf2
        WHERE mtf2.code = mi.tax_free AND mtf2.description = ?
      )`);
      params.push(taxFree);
    }

    // Listing Status
    if (listingStatus) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2
        JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
        WHERE mise2.issuer_id = mi.id AND mls2.description = ?
      )`);
      params.push(listingStatus);
    }

    // Secured Flag
    if (securedFlag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_secured_flag msf2
        WHERE msf2.code = mi.secured_flag AND msf2.description = ?
      )`);
      params.push(securedFlag);
    }

    // Arranger
    if (arranger) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia2
        JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
        WHERE ia2.issuer_id = mi.id AND ma2.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    /* ---------------------------------
       MAIN QUERY
    --------------------------------- */

    // Fix: Removed dependency on all_months table
    // Fix: Generate months inline to guarantee exactly 12 rows
    // Fix: Use LEFT JOIN so months with zero issues still appear
    // Fix: Use COALESCE for zero defaults
    const query = `
      SELECT
          m.month_no AS issue_month_no,
          m.month_name AS issue_month,
          COALESCE(
              COUNT(DISTINCT CONCAT(fd.id, '-', fd.arranger_id)),
              0
          ) AS no_of_issue,
          COALESCE(
            IF(
              SUM(fd.issue_size) > 0,
              ROUND(SUM(fd.issue_size) / 10000000, 2),
              0
            ),
            0
          ) AS issue_size,
          COALESCE(SUM(fd.issue_size), 0) AS actual_issue_size

      FROM (
        SELECT 1 AS month_no, 'January' AS month_name UNION ALL
        SELECT 2, 'February' UNION ALL
        SELECT 3, 'March' UNION ALL
        SELECT 4, 'April' UNION ALL
        SELECT 5, 'May' UNION ALL
        SELECT 6, 'June' UNION ALL
        SELECT 7, 'July' UNION ALL
        SELECT 8, 'August' UNION ALL
        SELECT 9, 'September' UNION ALL
        SELECT 10, 'October' UNION ALL
        SELECT 11, 'November' UNION ALL
        SELECT 12, 'December'
      ) m

      LEFT JOIN (
          SELECT
            mi.id,
            ia.arranger_id,
            mi.isin,
            mi.issue_size,
            mi.allotment_date
          FROM master_issuer mi

          INNER JOIN issuer_arranger ia
            ON ia.issuer_id = mi.id

          ${whereClause}
      ) fd ON MONTH(fd.allotment_date) = m.month_no

      GROUP BY
          m.month_no,
          m.month_name

      ORDER BY
          m.month_no ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    const finalResult = result.map((item) => ({
      issueMonthNo: item?.issue_month_no ?? '-',
      issueMonth: item?.issue_month ?? '-',
      noOfIssue: Number(item?.no_of_issue ?? 0),
      issueSize: Number(item?.issue_size ?? 0),
      actualIssueSize: Number(item?.actual_issue_size ?? 0)
    }));

    res.status(200).json({
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error(error);

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
      rating = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      trustee = "",
      creditRatingAgency = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      registrar = "",
      isin = ""
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

    // Fix: Use EXISTS subqueries for filters to prevent JOIN duplication
    // and avoid turning LEFT JOINs into effective INNER JOINs

    if (arranger) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_arranger ia2
        JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id
        WHERE ia2.issuer_id = i.id AND ma2.short_name LIKE ?
      )`);
      params.push(`%${arranger}%`);
    }

    if (issuerName) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_details id2
        WHERE id2.id = i.issuer_master_id AND id2.issuer_name LIKE ?
      )`);
      params.push(`%${issuerName}%`);
    }

    if (isin) {
      conditions.push(`i.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (rating) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2
        WHERE mir2.issuer_id = i.id AND mir2.rating = ?
      )`);
      params.push(rating);
    }

    if (seniority) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_seniority_tier_classification mstc2
        WHERE mstc2.code = i.seniority AND mstc2.description = ?
      )`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_tax_free mtf2
        WHERE mtf2.code = i.tax_free AND mtf2.description = ?
      )`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_secured_flag msf2
        WHERE msf2.code = i.secured_flag AND msf2.description = ?
      )`);
      params.push(securedFlag);
    }

    if (trustee) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_trustee it2
        JOIN master_trustee mt2 ON mt2.id = it2.trustee_id
        WHERE it2.issuer_id = i.id AND mt2.short_name LIKE ?
      )`);
      params.push(`%${trustee}%`);
    }

    if (creditRatingAgency) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_rating mir2
        JOIN master_agency mag2 ON mag2.id = mir2.agency_id
        WHERE mir2.issuer_id = i.id AND mag2.short_name LIKE ?
      )`);
      params.push(`%${creditRatingAgency}%`);
    }

    if (listingStatus) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise2
        JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status
        WHERE mise2.issuer_id = i.id AND mls2.description = ?
      )`);
      params.push(listingStatus);
    }

    if (securityType) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_security_type mst2
        WHERE mst2.code = i.security_class AND mst2.description = ?
      )`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`EXISTS (
        SELECT 1 FROM master_mode_issue mmi2
        WHERE mmi2.code = i.mode_issue AND mmi2.description = ?
      )`);
      params.push(modeOfIssue);
    }

    if (registrar) {
      conditions.push(`EXISTS (
        SELECT 1 FROM issuer_registrar ir2
        JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id
        WHERE ir2.issuer_id = i.id AND mr2.short_name LIKE ?
      )`);
      params.push(`%${registrar}%`);
    }

    // Final WHERE Clause
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY
    // =========================

    // Fix: Removed all_months JOIN (was causing duplicate rows)
    // Fix: Added all non-aggregated columns to GROUP BY
    // Fix: Added ORDER BY inside GROUP_CONCAT for deterministic results
    // Fix: Use subqueries for one-to-many relationships to prevent M×N explosion
    const dataQuery = `
      SELECT
          i.id AS issuerId,
          ia.arranger_id,
          ma.short_name AS arranger_name,
          i.isin,
          id.issuer_name,
          i.allotment_date,
          icd.coupon_rate,
          mt.short_name AS debenture_trustee_name,
          mr.short_name AS registrar_detail,
          i.maturity_date,
          GROUP_CONCAT(DISTINCT mir.rating ORDER BY mir.rating ASC SEPARATOR ', ') AS rating,
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
              INNER JOIN master_listing_status AS mls
                  ON mls.code = mise.listing_status
              WHERE mise.issuer_id = i.id
              ORDER BY mise.listing_status ASC, mise.id ASC
              LIMIT 1
          ) AS listing_status,
          i.issuer_master_id

      FROM master_issuer AS i

      LEFT JOIN issuer_details AS id
          ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
          ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
          ON i.mode_issue = mi.code

      LEFT JOIN issuer_coupon_details AS icd
          ON i.id = icd.issuer_id

      LEFT JOIN master_seniority_tier_classification AS mstc
          ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
          ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
          ON msf.code = i.secured_flag

      -- One-to-many: use LEFT JOIN but GROUP BY i.id
      LEFT JOIN issuer_trustee AS it
          ON i.id = it.issuer_id
      LEFT JOIN master_trustee AS mt
          ON it.trustee_id = mt.id

      LEFT JOIN issuer_registrar AS ir1
          ON i.id = ir1.issuer_id
      LEFT JOIN master_registrar AS mr
          ON ir1.registrar_id = mr.id

      LEFT JOIN master_issuer_rating AS mir
          ON i.id = mir.issuer_id
      LEFT JOIN master_agency AS mag
          ON mag.id = mir.agency_id

      INNER JOIN issuer_arranger AS ia
          ON i.id = ia.issuer_id
      INNER JOIN master_arranger AS ma
          ON ia.arranger_id = ma.id

      ${whereClause}

      GROUP BY
          i.id,
          ia.arranger_id,
          ma.short_name,
          i.isin,
          id.issuer_name,
          i.allotment_date,
          icd.coupon_rate,
          mt.short_name,
          mr.short_name,
          i.maturity_date,
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

    // =========================
    // COUNT QUERY
    // =========================

    // Fix: Simplified count query — no need for all JOINs
    // Fix: Count distinct issuer-arranger combinations
    const countQuery = `
      SELECT COUNT(DISTINCT CONCAT(i.id, '-', ia.arranger_id)) AS total
      FROM master_issuer AS i
      INNER JOIN issuer_arranger AS ia ON i.id = ia.issuer_id
      INNER JOIN master_arranger AS ma ON ia.arranger_id = ma.id
      ${whereClause}
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [result, countResult] = await Promise.all([

      prisma.$queryRawUnsafe(
        dataQuery,
        ...params,
        safeLimit,
        safeOffset
      ),

      prisma.$queryRawUnsafe(
        countQuery,
        ...params
      )

    ]);

    // =========================
    // TOTAL
    // =========================

    const total = parseInt(countResult?.[0]?.total, 10) || 0;

    // =========================
    // FORMAT RESPONSE
    // =========================

    const finalResult = result?.map((item) => {

      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date)
          .toISOString()
          .split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date)
          .toISOString()
          .split('T')[0]
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

    console.error(
      'arrangers_page_monthly_detailed_data Error:',
      error
    );

    return res.status(500).json({

      success: false,

      error:
        'Failed to fetch arrangers monthly detailed data',

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
    } = req.body;

    if (!startDate || !endDate || !arrangerId) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and arrangerId are required',
      });
    }

    // Fix: Validate dates
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }

    // Fix: Validate arrangerId
    const safeArrangerId = Number(arrangerId);
    if (isNaN(safeArrangerId) || safeArrangerId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'arrangerId must be a positive number',
      });
    }

    // Fix: Validate and sanitize limit/offset
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 25));
    const safeOffset = Math.max(0, Number(offset) || 0);

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

    // Fix: Strict sortField validation — only exact matches allowed
    const orderBy = validSortFields.includes(sortField)
      ? sortField
      : 'issuer_name';

    const orderDirection =
      String(sortOrder).toUpperCase() === 'DESC'
        ? 'DESC'
        : 'ASC';

    // Fix: Sanitize SearchQuery for LIKE patterns
    const safeSearchQuery = SearchQuery?.trim() || '';
    // Escape SQL LIKE special characters: % _ \
    const escapeLike = (str) => str.replace(/[%_\\]/g, '\\$&');
    const searchPattern = safeSearchQuery ? `%${escapeLike(safeSearchQuery)}%` : null;

    /* ---------------------------------
       BASE QUERY (shared between data and count)
    --------------------------------- */

    // Fix: Removed all_months JOIN (was causing duplicate rows)
    // Fix: All filters use parameter binding
    // Fix: All one-to-many relationships aggregated properly
    const baseQuery = `
      SELECT
          i.id AS issuerId,
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
              INNER JOIN master_listing_status AS mls
                  ON mls.code = mise.listing_status
              WHERE mise.issuer_id = i.id
              ORDER BY mise.listing_status ASC, mise.id ASC
              LIMIT 1
          ) AS listing_status,
          i.issuer_master_id

      FROM master_issuer i

      LEFT JOIN issuer_details id
          ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type s
          ON i.security_class = s.code

      LEFT JOIN master_mode_issue mi
          ON i.mode_issue = mi.code

      LEFT JOIN issuer_coupon_details icd
          ON i.id = icd.issuer_id

      LEFT JOIN master_seniority_tier_classification mstc
          ON mstc.code = i.seniority

      LEFT JOIN master_tax_free tf
          ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag msf
          ON msf.code = i.secured_flag

      LEFT JOIN issuer_trustee it
          ON i.id = it.issuer_id
      LEFT JOIN master_trustee mt
          ON it.trustee_id = mt.id

      LEFT JOIN issuer_registrar ir1
          ON i.id = ir1.issuer_id
      LEFT JOIN master_registrar mr
          ON ir1.registrar_id = mr.id

      LEFT JOIN master_issuer_rating mir
          ON i.id = mir.issuer_id
      LEFT JOIN master_agency mag
          ON mag.id = mir.agency_id

      INNER JOIN issuer_arranger ia
          ON i.id = ia.issuer_id
      INNER JOIN master_arranger ma
          ON ia.arranger_id = ma.id

      WHERE ia.arranger_id = ?
        AND i.allotment_date BETWEEN ? AND ? 
        AND i.is_visible = 1

      GROUP BY
          i.id,
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
    `;

    /* ---------------------------------
       DATA QUERY
    --------------------------------- */

    let dataQuery = baseQuery;
    const dataParams = [safeArrangerId, `${startDate} 00:00:00`, `${endDate} 23:59:59`];

    // Fix: Search condition with parameter binding
    if (searchPattern) {
      dataQuery = `
        SELECT * FROM (${baseQuery}) x
        WHERE (
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
      // Add search pattern for each LIKE clause
      dataParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    dataQuery += ` ORDER BY ${orderBy} ${orderDirection} LIMIT ? OFFSET ?`;
    dataParams.push(safeLimit, safeOffset);

    /* ---------------------------------
       COUNT QUERY
    --------------------------------- */

    // Fix: Simplified count query using the same base
    let countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) x`;
    const countParams = [safeArrangerId, `${startDate} 00:00:00`, `${endDate} 23:59:59`];

    if (searchPattern) {
      countQuery = `
        SELECT COUNT(*) AS total FROM (${baseQuery}) x
        WHERE (
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
      countParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    /* ---------------------------------
       EXECUTE QUERIES
    --------------------------------- */

    const [data, totalCount] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams),
    ]);

    /* ---------------------------------
       FORMAT RESPONSE
    --------------------------------- */

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

    return res.json({
      success: true,
      totalRecords: Number(totalCount?.[0]?.total || 0),
      data: formattedData,
    });

  } catch (error) {
    console.error('arranger_top_participants_details error:', error);

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

    /* ---------------- FILTER BUILDERS ---------------- */

    const baseFilterConditions = [];
    const baseFilterParams = [];

    const addBaseFilter = (sql, ...values) => {
      baseFilterConditions.push(sql);
      baseFilterParams.push(...values);
    };

    if (rating) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = mi.id AND mir.rating = ?)`, rating);
    }

    if (registrar) {
      addBaseFilter(`EXISTS (SELECT 1 FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = mi.id AND mr.registrar_name LIKE ?)`, `%${registrar}%`);
    }

    if (seniority) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = mi.seniority AND mstc.description = ?)`, seniority);
    }

    if (taxFree) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = mi.tax_free AND mtf.description = ?)`, taxFree);
    }

    if (securedFlag) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = mi.secured_flag AND msf.description = ?)`, securedFlag);
    }

    if (sector) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = mi.business_sector AND mbs.description = ?)`, sector);
    }

    if (nature) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_issuer_type_nature mitn WHERE mitn.code = mi.nature_type AND mitn.description = ?)`, nature);
    }

    if (ownershipType) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = mi.issuer_ownership_type AND miot.description = ?)`, ownershipType);
    }

    if (creditRatingAgency) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency ma2 ON ma2.id = mir2.agency_id WHERE mir2.issuer_id = mi.id AND ma2.short_name = ?)`, creditRatingAgency);
    }

    if (dealSize) {
      addBaseFilter(`mi.issue_size LIKE ?`, `%${dealSize}%`);
    }

    if (listingStatus) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_issuer_stock_exchange mise JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = mi.id AND mls.description = ?)`, listingStatus);
    }

    if (securityType) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = mi.security_class AND mst.description = ?)`, securityType);
    }

    if (modeOfIssue) {
      addBaseFilter(`EXISTS (SELECT 1 FROM master_mode_issue mmoi WHERE mmoi.code = mi.mode_issue AND mmoi.description = ?)`, modeOfIssue);
    }

    if (isin) {
      addBaseFilter(`mi.isin LIKE ?`, `%${isin}%`);
    }

    const baseFilterSql = baseFilterConditions.length > 0 ? ' AND ' + baseFilterConditions.join(' AND ') : '';

    // Trustee filter applied directly where mt is already joined
    const trusteeDirectSql = trustee ? ` AND mt.short_name LIKE ?` : '';
    const trusteeDirectParams = trustee ? [`%${trustee}%`] : [];

    // Trustee filter applied via EXISTS where mt is NOT joined (totals)
    const trusteeExistsSql = trustee ? ` AND EXISTS (SELECT 1 FROM issuer_trustee it2 JOIN master_trustee mt2 ON mt2.id = it2.trustee_id WHERE it2.issuer_id = mi.id AND mt2.short_name LIKE ?)` : '';
    const trusteeExistsParams = trustee ? [`%${trustee}%`] : [];

    /* ---------------- TOTALS ---------------- */

    const totalIssueSizeRaw = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${baseFilterSql}
    `, formatDate(currentStartDate), formatDate(currentEndDate), ...trusteeExistsParams, ...baseFilterParams);

    const totalIssueSizePrevYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(mi.issue_size), 0) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${baseFilterSql}
    `, formatDate(previousStartDate), formatDate(previousEndDate), ...trusteeExistsParams, ...baseFilterParams);

const totalIssuesCountCurrYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${baseFilterSql}
    `, formatDate(currentStartDate), formatDate(currentEndDate), ...trusteeExistsParams, ...baseFilterParams);

    const totalIssuesCountPrevYearRaw = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS aggregate
      FROM master_issuer mi
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeExistsSql}
      ${baseFilterSql}
    `, formatDate(previousStartDate), formatDate(previousEndDate), ...trusteeExistsParams, ...baseFilterParams);

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
        t1.issuer_name,
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
          mt.short_name AS issuer_name,
          COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${baseFilterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${baseFilterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    } else {
      tableQuery = `
      SELECT
        t1.id,
        t1.issuer_name,
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
          mt.short_name AS issuer_name,
          COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${baseFilterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
        ${trusteeDirectSql}
        ${baseFilterSql}
        GROUP BY it.trustee_id, mt.id, mt.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery,
      formatDate(currentStartDate), formatDate(currentEndDate), ...trusteeDirectParams, ...baseFilterParams,
      formatDate(previousStartDate), formatDate(previousEndDate), ...trusteeDirectParams, ...baseFilterParams
    );

    /*----total count for table pagination ---*/
    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mt.id) AS total
      FROM master_issuer mi
      JOIN issuer_trustee it ON it.issuer_id = mi.id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${baseFilterSql}
    `,
      formatDate(currentStartDate), formatDate(currentEndDate), ...trusteeDirectParams, ...baseFilterParams
    );

    const totalRecords = parseInt(totalCountResult[0]?.total, 10) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

const sectorValueSelect =
  issueType === 'count'
    ? 'COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date)'
    : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedTrusteesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_trustee it ON it.issuer_id = mi.id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${baseFilterSql}
      GROUP BY it.trustee_id, mt.id, mt.short_name
      LIMIT 10
    `
        : `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.issuer_master_id, mi.allotment_date) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_trustee it ON it.issuer_id = mi.id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${trusteeDirectSql}
      ${baseFilterSql}
      GROUP BY it.trustee_id, mt.id, mt.short_name
      LIMIT 10
    `;

    const sectorQuery = `
      SELECT
        r.trustee_id AS id,
        r.trustee_name AS issuer_name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedTrusteesSubQuery}) r
      JOIN issuer_trustee it ON it.trustee_id = r.trustee_id
      JOIN master_issuer mi ON mi.id = it.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      WHERE mi.allotment_date BETWEEN ? AND ? AND (mi.is_visible = 1)
      ${baseFilterSql}
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
      formatDate(currentStartDate), formatDate(currentEndDate), ...trusteeDirectParams, ...baseFilterParams,
      formatDate(currentStartDate), formatDate(currentEndDate), ...baseFilterParams
    );

    /* ---------------- RESPONSE FORMAT ---------------- */

    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.issuer_name ?? '-',
      currentSize: item.cy_issue_size ?? '-',
      currentDeals: item.cy_issues ?? '-',
      currentMarketShare: item.cy_mkt_share ?? '-',
      previousRank: item.py_arr_rank ?? '-',
      previousSize: item.py_issue_size ?? '-',
      previousDeals: item.py_issues ?? '-',
      previousMarketShare: item.py_mkt_share ?? '-',
      yoyChange: item.yoy ?? '-'
    }));

    res.status(200).json({
      tableData: finalResult,
      sectorData,
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
      id,
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

    // Parse and validate id
    const parsedId = parseInt(id, 10);
    const isIdValid = !isNaN(parsedId) && parsedId > 0;

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    if (isNaN(currentStartDate.getTime()) || isNaN(currentEndDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- FILTER BUILDERS ---------------- */

    const filterConditions = [];
    const filterParams = [];

    const addFilter = (sql, ...values) => {
      filterConditions.push(sql);
      filterParams.push(...values);
    };

    if (rating) {
      addFilter(`master_issuer_rating.rating = ?`, rating);
    }

    if (registrar) {
      addFilter(`EXISTS (SELECT 1 FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = i.id AND mr.registrar_name LIKE ?)`, `%${registrar}%`);
    }

    if (seniority) {
      addFilter(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = i.seniority AND mstc.description = ?)`, seniority);
    }

    if (taxFree) {
      addFilter(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = i.tax_free AND mtf.description = ?)`, taxFree);
    }

    if (securedFlag) {
      addFilter(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = i.secured_flag AND msf.description = ?)`, securedFlag);
    }

    if (sector) {
      addFilter(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = i.business_sector AND mbs.description = ?)`, sector);
    }

    if (trustee) {
      addFilter(`EXISTS (SELECT 1 FROM issuer_trustee it2 JOIN master_trustee mt2 ON mt2.id = it2.trustee_id WHERE it2.issuer_id = i.id AND mt2.short_name LIKE ?)`, `%${trustee}%`);
    }

    if (nature) {
      addFilter(`EXISTS (SELECT 1 FROM master_issuer_type_nature mitn WHERE mitn.code = i.nature_type AND mitn.description = ?)`, nature);
    }

    if (ownershipType) {
      addFilter(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = i.issuer_ownership_type AND miot.description = ?)`, ownershipType);
    }

    if (creditRatingAgency) {
      addFilter(`master_agency.short_name = ?`, creditRatingAgency);
    }

    if (dealSize) {
      addFilter(`i.issue_size LIKE ?`, `%${dealSize}%`);
    }

    if (listingStatus) {
      addFilter(`EXISTS (SELECT 1 FROM master_issuer_stock_exchange mise JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = i.id AND mls.description = ?)`, listingStatus);
    }

    if (securityType) {
      addFilter(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = i.security_class AND mst.description = ?)`, securityType);
    }

    if (modeOfIssue) {
      addFilter(`EXISTS (SELECT 1 FROM master_mode_issue mmoi WHERE mmoi.code = i.mode_issue AND mmoi.description = ?)`, modeOfIssue);
    }

    if (isin) {
      addFilter(`i.isin LIKE ?`, `%${isin}%`);
    }

    const filterSql = filterConditions.length > 0
      ? ' AND ' + filterConditions.join(' AND ')
      : '';

    /* ---------------- FILTERED TOTALS ---------------- */

    // Total must match the same population as the main query:
    // - include only issuers that have at least one trustee
    // - when id > 0, count only that agency's ratings so percentages sum to 100%
    const idFilterSql = isIdValid ? ` AND master_agency.id = ?` : '';
    const idFilterParams = isIdValid ? [parsedId] : [];

    const totalRatingNoResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT master_issuer_rating.id) AS aggregate
      FROM master_issuer_rating
      JOIN master_issuer i ON i.id = master_issuer_rating.issuer_id
      JOIN master_agency ON master_agency.id = master_issuer_rating.agency_id
      JOIN issuer_trustee ON issuer_trustee.issuer_id = i.id
      WHERE i.allotment_date BETWEEN ? AND ?
      ${filterSql}
      ${idFilterSql}
    `, formatDate(currentStartDate), formatDate(currentEndDate), ...filterParams, ...idFilterParams);

    const totalRatingNo = Number(totalRatingNoResult[0]?.aggregate) || 0;
    const safeTotalRatingNo = totalRatingNo > 0 ? totalRatingNo : 1;

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const idFilterAndGroupSql = isIdValid
      ? `AND master_agency.id = ? GROUP BY master_issuer_rating.rating`
      : `GROUP BY master_issuer_rating.agency_id`;

    const creditRatingQuery = `
      SELECT
        master_agency.short_name AS label,
        ROUND(
          (COUNT(DISTINCT master_issuer_rating.id) / ${safeTotalRatingNo}) * 100,
          2
        ) AS percentage,
        COUNT(DISTINCT master_issuer_rating.id) AS rating_no,
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
      INNER JOIN master_issuer AS i
        ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_trustee
        ON issuer_trustee.issuer_id = i.id
      WHERE i.allotment_date BETWEEN ? AND ?
      ${filterSql}
      ${idFilterAndGroupSql}
    `;

    const queryParams = [
      formatDate(currentStartDate),
      formatDate(currentEndDate),
      ...filterParams
    ];

    if (isIdValid) {
      queryParams.push(parsedId);
    }

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery, ...queryParams);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
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
  const {
    startDate = '2025-04-01',
    endDate = '2026-03-31',
    limit = 25,
    offset = 0,
    issuerName = "",
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

  try {
    // ---------------------
    // Input validation
    // ---------------------
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ error: 'limit must be a non-negative integer' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    // Format dates for SQL (include time to capture full last day)
    const formatDateForSql = (dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateForSql(startDate);
    const sqlEndDate = formatDateForSql(endDate);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // ---------------------
    // Dynamic WHERE conditions
    // ---------------------
    const conditions = [];
    const params = [];

    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM issuer_trustee it
        WHERE it.issuer_id = master_issuer.id
      )
    `);

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = master_issuer.id AND mir.rating = ?)`, rating);
      params.push(rating);
    }

    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_stock_exchange mise2 LEFT JOIN master_listing_status mls2 ON mls2.code = mise2.listing_status WHERE mise2.issuer_id = master_issuer.id AND mls2.description = ?)`, listingStatus);
      params.push(listingStatus);
    }

    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      params.push(securedFlag);
    }

    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      params.push(sector);
    }

    if (trustee) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_trustee it2 JOIN master_trustee mt2 ON mt2.id = it2.trustee_id WHERE it2.issuer_id = master_issuer.id AND mt2.short_name LIKE ?)`);
      params.push(`%${trustee}%`);
    }

    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      params.push(nature);
    }

    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      params.push(ownershipType);
    }

    if (creditRatingAgency) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency ma2 ON ma2.id = mir2.agency_id WHERE mir2.issuer_id = master_issuer.id AND ma2.short_name = ?)`);
      params.push(creditRatingAgency);
    }

    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      params.push(modeOfIssue);
    }

    if (isin) {
      conditions.push(`master_issuer.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (arranger) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_arranger ia2 JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id WHERE ia2.issuer_id = master_issuer.id AND ma2.short_name LIKE ?)`);
      params.push(`%${arranger}%`);
    }

    if (registrar) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_registrar ir2 JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id WHERE ir2.issuer_id = master_issuer.id AND mr2.registrar_name LIKE ?)`);
      params.push(`%${registrar}%`);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // ---------------------
    // Main data query (no Cartesian product)
    // ---------------------
    const dataQuery = `
      SELECT
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,

        issuer_details.issuer_name AS issuer_name,

        master_issuer_ownership_type.description AS ownership_type,

        master_issuer_type_nature.description AS nature,

        master_business_sector.description AS sector,

        master_security_type.description AS security_type,

        master_mode_issue.description AS mode_of_issue,

        master_seniority_tier_classification.description AS Seniority,

        master_tax_free.description AS tax_free,

        master_secured_flag.description AS secured_flag,

        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = master_issuer.id
        ) AS debenture_trustee,

        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = master_issuer.id
        ) AS Arranger,

        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = master_issuer.id
        ) AS Registrar,

        (
          SELECT GROUP_CONCAT(DISTINCT CONCAT(ma.short_name, ': ', mir.rating) SEPARATOR '; ')
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = master_issuer.id
        ) AS credit_rating_info,

        (
          SELECT mir.rating
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = master_issuer.id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating,

        (
          SELECT ma.short_name
          FROM master_issuer_rating mir
          JOIN master_agency ma ON ma.id = mir.agency_id
          WHERE mir.issuer_id = master_issuer.id
          ORDER BY ma.id
          LIMIT 1
        ) AS credit_rating_agency,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = master_issuer.id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status,

        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange mise
          WHERE mise.issuer_id = master_issuer.id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.id
          LIMIT 1
        ) AS listing_status_code,

        (
          SELECT icd.coupon_rate
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = master_issuer.id
          ORDER BY icd.id
          LIMIT 1
        ) AS coupon_rate

      FROM master_issuer

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

      ${whereClause}

      ORDER BY master_issuer.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ---------------------
    // Count query
    // ---------------------
    const countQuery = `
      SELECT COUNT(DISTINCT master_issuer.id) AS total
      FROM master_issuer

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

      ${whereClause}
    `;

    // ---------------------
    // Execute queries
    // ---------------------
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

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
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate || '-',
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

    // ---------------------
    // Response
    // ---------------------
    res.status(200).json({
      data: finalResult,
      pagination: {
        total: total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: (parsedOffset + parsedLimit) < total
      }
    });

  } catch (error) {
    console.error('TrusteePage detailed data API error:', error);
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
      endDate = '2026-03-31',

      ownershipType = "",
      sector = "",
      nature = "",
      securityType = "",
      creditRatingAgency = "",
      modeOfIssue = "",
      seniority = "",
      taxFree = "",
      listingStatus = "",
      securedFlag = "",
      rating = "",
      dealSize = "",

      // optional trustee filter
      trustee = ""
    } = req.body;

    /* ---------------------------------
       DATE VALIDATION
    --------------------------------- */

    const formatDateForSql = (dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateForSql(startDate);
    const sqlEndDate = formatDateForSql(endDate);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    /* ---------------------------------
       BUILD DYNAMIC CONDITIONS (filters only, no date)
    --------------------------------- */

    const conditions = [];
    const params = [];

    // Rating (use EXISTS to avoid join explosion)
    if (rating) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = mi.id AND mir.rating = ?)`);
      params.push(rating);
    }

    // Deal Size
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    // Ownership Type
    if (ownershipType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = mi.issuer_ownership_type AND miot.description = ?)`);
      params.push(ownershipType);
    }

    // Sector
    if (sector) {
      conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = mi.business_sector AND mbs.description = ?)`);
      params.push(sector);
    }

    // Nature
    if (nature) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_type_nature mint WHERE mint.code = mi.nature_type AND mint.description = ?)`);
      params.push(nature);
    }

    // Security Type
    if (securityType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = mi.security_class AND mst.description = ?)`);
      params.push(securityType);
    }

    // Credit Rating Agency (use EXISTS to avoid join explosion)
    if (creditRatingAgency) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency ma2 ON ma2.id = mir2.agency_id WHERE mir2.issuer_id = mi.id AND ma2.short_name = ?)`);
      params.push(creditRatingAgency);
    }

    // Mode Of Issue
    if (modeOfIssue) {
      conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = mi.mode_issue AND mmi.description = ?)`);
      params.push(modeOfIssue);
    }

    // Seniority
    if (seniority) {
      conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = mi.seniority AND mstc.description = ?)`);
      params.push(seniority);
    }

    // Tax Free
    if (taxFree) {
      conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = mi.tax_free AND mtf.description = ?)`);
      params.push(taxFree);
    }

    // Listing Status (use EXISTS to avoid join explosion)
    if (listingStatus) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_stock_exchange mise JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = mi.id AND mls.description = ?)`);
      params.push(listingStatus);
    }

    // Secured Flag
    if (securedFlag) {
      conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = mi.secured_flag AND msf.description = ?)`);
      params.push(securedFlag);
    }

    // Trustee — using LIKE for consistency with other APIs
    if (trustee) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_trustee it JOIN master_trustee trustee_master ON trustee_master.id = it.trustee_id WHERE it.issuer_id = mi.id AND trustee_master.short_name LIKE ?)`);
      params.push(`%${trustee}%`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* ---------------------------------
       MAIN QUERY
    --------------------------------- */

    const query = `
      SELECT
          am.month_no AS issue_month_no,
          MONTHNAME(STR_TO_DATE(am.month_no, '%m')) AS issue_month,
          COUNT(DISTINCT CONCAT(mi.id, '-', it.trustee_id)) AS no_of_issue,
          COALESCE(ROUND(SUM(mi.issue_size) / 10000000, 2), 0) AS issue_size,
          COALESCE(SUM(mi.issue_size), 0) AS actual_issue_size
      FROM all_months am
      
      LEFT JOIN master_issuer mi
          ON am.month_no = MONTH(mi.allotment_date)
          AND mi.allotment_date BETWEEN ? AND ?

      LEFT JOIN issuer_trustee it
          ON it.issuer_id = mi.id

      LEFT JOIN master_trustee mt
          ON mt.id = it.trustee_id
      ${whereClause}
      GROUP BY am.month_no
      ORDER BY CAST(am.month_no AS UNSIGNED) ASC
    `;

    const queryParams = [sqlStartDate, sqlEndDate, ...params];

    const result = await prisma.$queryRawUnsafe(query, ...queryParams);

    const finalResult = result.map((item) => ({
      issueMonthNo: item?.issue_month_no || '-',
      issueMonth: item?.issue_month || '-',
      noOfIssue: Number(item?.no_of_issue || 0),
      issueSize: Number(item?.issue_size || 0),
      actualIssueSize: Number(item?.actual_issue_size || 0)
    }));

    res.status(200).json({
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Trustee monthly summary API error:', error);

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

      trusteeName = "",
      issuerName = "",
      rating = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      creditRatingAgency = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      arranger = "",
      registrar = "",
      isin = ""
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        error: 'limit must be a non-negative integer'
      });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        error: 'offset must be a non-negative integer'
      });
    }

    const parsedMonth = month ? parseInt(month, 10) : null;
    if (month && (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12)) {
      return res.status(400).json({
        success: false,
        error: 'month must be an integer between 1 and 12'
      });
    }

    // Validate and format dates
    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }

    // =========================
    // BUILD DYNAMIC CONDITIONS
    // =========================

    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    // Month Filter
    if (parsedMonth) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(parsedMonth);
    }

    // =========================
    // DYNAMIC FILTERS
    // =========================

    if (trusteeName) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_trustee it2 JOIN master_trustee mt2 ON mt2.id = it2.trustee_id WHERE it2.issuer_id = i.id AND mt2.short_name LIKE ?)`);
      params.push(`%${trusteeName}%`);
    }

    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (isin) {
      conditions.push(`i.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (rating) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = i.id AND mir.rating = ?)`);
      params.push(rating);
    }

    if (seniority) {
      conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = i.seniority AND mstc.description = ?)`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = i.tax_free AND mtf.description = ?)`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = i.secured_flag AND msf.description = ?)`);
      params.push(securedFlag);
    }

    if (creditRatingAgency) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency ma2 ON ma2.id = mir2.agency_id WHERE mir2.issuer_id = i.id AND ma2.short_name = ?)`);
      params.push(creditRatingAgency);
    }

    if (listingStatus) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM master_issuer_stock_exchange mise2
          LEFT JOIN master_listing_status mls2
            ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.id
            AND mls2.description = ?
        )
      `);
      params.push(listingStatus);
    }

    if (securityType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = i.security_class AND mst.description = ?)`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = i.mode_issue AND mmi.description = ?)`);
      params.push(modeOfIssue);
    }

    if (arranger) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_arranger ia2 JOIN master_arranger ma2 ON ma2.id = ia2.arranger_id WHERE ia2.issuer_id = i.id AND ma2.short_name LIKE ?)`);
      params.push(`%${arranger}%`);
    }

    if (registrar) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_registrar ir2 JOIN master_registrar mr2 ON mr2.id = ir2.registrar_id WHERE ir2.issuer_id = i.id AND mr2.registrar_name LIKE ?)`);
      params.push(`%${registrar}%`);
    }

    // =========================
    // FINAL WHERE CLAUSE
    // =========================

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // =========================
    // DATA QUERY (no Cartesian product)
    // =========================

    const dataQuery = `
      SELECT
          i.id AS issuerId,

          it.trustee_id,

          mt.short_name AS debenture_trustee_name,

          i.isin,

          id.issuer_name,

          i.allotment_date,

          i.maturity_date,

          i.security_name,

          i.issue_size,

          i.face_value,

          i.issuer_master_id,

          s.description AS security_type,

          mi.description AS mode_issue,

          mstc.description AS seniority,

          tf.description AS tax_free,

          msf.description AS secured_flag,

          (
            SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
            FROM issuer_coupon_details icd
            WHERE icd.issuer_id = i.id
          ) AS coupon_rate,

          (
            SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
            FROM issuer_arranger ia
            JOIN master_arranger ma ON ma.id = ia.arranger_id
            WHERE ia.issuer_id = i.id
          ) AS arranger_name,

          (
            SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
            FROM issuer_registrar ir
            JOIN master_registrar mr ON mr.id = ir.registrar_id
            WHERE ir.issuer_id = i.id
          ) AS registrar_detail,

          (
            SELECT GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ')
            FROM master_issuer_rating mir
            JOIN master_agency mag ON mag.id = mir.agency_id
            WHERE mir.issuer_id = i.id
          ) AS rating_info,

          (
            SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
            FROM master_issuer_rating mir
            WHERE mir.issuer_id = i.id
          ) AS rating,

          (
            SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
            FROM master_issuer_rating mir
            JOIN master_agency mag ON mag.id = mir.agency_id
            WHERE mir.issuer_id = i.id
          ) AS agency_name,

          (
            SELECT mls.description
            FROM master_issuer_stock_exchange AS mise
            LEFT JOIN master_listing_status AS mls
              ON mls.code = mise.listing_status
            WHERE mise.issuer_id = i.id
            ORDER BY mise.listing_status
            LIMIT 1
          ) AS listing_status

      FROM master_issuer AS i

      INNER JOIN issuer_trustee AS it
          ON i.id = it.issuer_id

      INNER JOIN master_trustee AS mt
          ON it.trustee_id = mt.id

      LEFT JOIN issuer_details AS id
          ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
          ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
          ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification AS mstc
          ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
          ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
          ON msf.code = i.secured_flag

      ${whereClause}

      GROUP BY i.id, it.trustee_id, mt.short_name, id.issuer_name, i.isin,
           i.allotment_date, i.maturity_date, i.security_name, i.issue_size,
           i.face_value, i.issuer_master_id, s.description, mi.description,
           mstc.description, tf.description, msf.description

      ORDER BY id.issuer_name ASC

      LIMIT ? OFFSET ?
    `;

    // =========================
    // COUNT QUERY
    // =========================

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT i.id
        FROM master_issuer AS i

        INNER JOIN issuer_trustee AS it
            ON i.id = it.issuer_id

        INNER JOIN master_trustee AS mt
            ON it.trustee_id = mt.id

        LEFT JOIN issuer_details AS id
            ON i.issuer_master_id = id.id

        LEFT JOIN master_security_type AS s
            ON i.security_class = s.code

        LEFT JOIN master_mode_issue AS mi
            ON i.mode_issue = mi.code

        LEFT JOIN master_seniority_tier_classification AS mstc
            ON mstc.code = i.seniority

        LEFT JOIN master_tax_free AS tf
            ON tf.code = i.tax_free

        LEFT JOIN master_secured_flag AS msf
            ON msf.code = i.secured_flag

        ${whereClause}

        GROUP BY i.id, it.trustee_id
      ) AS aggregate_table
    `;

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [result, countResult] = await Promise.all([

      prisma.$queryRawUnsafe(
        dataQuery,
        ...params,
        parsedLimit,
        parsedOffset
      ),

      prisma.$queryRawUnsafe(
        countQuery,
        ...params
      )

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
        ? new Date(item.allotment_date)
          .toISOString()
          .split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date)
          .toISOString()
          .split('T')[0]
        : '-';

      return {

        issuerId: item?.issuerId || '-',

        trusteeId: item?.trustee_id || '-',

        debentureTrustee:
          item?.debenture_trustee_name || '-',

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

        creditRatingAgency:
          item?.agency_name || '-',

        arranger: item?.arranger_name || '-',

        registrar: item?.registrar_detail || '-',

        seniority: item?.seniority || '-',

        taxFree: item?.tax_free || '-',

        securedFlag: item?.secured_flag || '-',

        listingStatus:
          item?.listing_status || '-',

        issuerMasterId:
          item?.issuer_master_id || '-'
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

        limit: parsedLimit,

        offset: parsedOffset,

        hasMore:
          parsedOffset + parsedLimit < total
      }
    });

  } catch (error) {

    console.error(
      'trustee_page monthly_detailed_data Error:',
      error
    );

    return res.status(500).json({

      success: false,

      error:
        'Failed to fetch trustee monthly detailed data',

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

    // Validate and format dates
    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
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
      String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // =========================
    // SEARCH CONFIGURATION
    // =========================

    const searchTerm = SearchQuery?.trim() || '';
    const searchPattern = searchTerm ? `%${searchTerm}%` : null;

    // =========================
    // DATA QUERY (no Cartesian product, fully parameterized)
    // =========================

    const dataQuery = `
      SELECT *
      FROM (
          SELECT
              i.id AS issuerId,
              i.isin,
              id.issuer_name,
              i.allotment_date,
              i.maturity_date,
              i.security_name,
              i.issue_size,
              i.face_value,
              i.issuer_master_id,

              (
                  SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
                  FROM issuer_coupon_details icd
                  WHERE icd.issuer_id = i.id
              ) AS coupon_rate,

              mt.short_name AS debenture_trustee_name,

              (
                  SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
                  FROM issuer_registrar ir
                  JOIN master_registrar mr ON mr.id = ir.registrar_id
                  WHERE ir.issuer_id = i.id
              ) AS registrar_detail,

              (
                  SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
                  FROM master_issuer_rating mir
                  WHERE mir.issuer_id = i.id
              ) AS rating,

              (
                  SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
                  FROM issuer_arranger ia
                  JOIN master_arranger ma ON ma.id = ia.arranger_id
                  WHERE ia.issuer_id = i.id
              ) AS arranger_name,

              s.description AS security_type,

              mi.description AS mode_issue,

              (
                  SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
                  FROM master_issuer_rating mir
                  JOIN master_agency mag ON mag.id = mir.agency_id
                  WHERE mir.issuer_id = i.id
              ) AS agency_name,

              mstc.description AS seniority,

              tf.description AS tax_free,

              msf.description AS secured_flag,

              (
                  SELECT mls.description
                  FROM master_issuer_stock_exchange mise
                  LEFT JOIN master_listing_status mls
                      ON mls.code = mise.listing_status
                  WHERE mise.issuer_id = i.id
                  ORDER BY mise.listing_status
                  LIMIT 1
              ) AS listing_status

          FROM master_issuer i

          INNER JOIN issuer_trustee it
              ON i.id = it.issuer_id

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

          WHERE
              it.trustee_id = ?
              AND i.allotment_date BETWEEN ? AND ?
      ) x
      WHERE 1=1
      ${searchPattern ? `
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
      ` : ''}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;

    const dataParams = [
      parsedTrusteeId,
      sqlStartDate,
      sqlEndDate,
    ];

    if (searchPattern) {
      dataParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    dataParams.push(parsedLimit, parsedOffset);

    // =========================
    // COUNT QUERY
    // =========================

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
          SELECT
              i.id
          FROM master_issuer i

          INNER JOIN issuer_trustee it
              ON i.id = it.issuer_id

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

          WHERE
              it.trustee_id = ?
              AND i.allotment_date BETWEEN ? AND ?
      ) x
      WHERE 1=1
      ${searchPattern ? `
        AND (
          issuer_name LIKE ?
          OR isin LIKE ?
          OR (
            SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
            FROM issuer_coupon_details icd
            WHERE icd.issuer_id = x.id
          ) LIKE ?
          OR mt.short_name LIKE ?
          OR (
            SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
            FROM issuer_registrar ir
            JOIN master_registrar mr ON mr.id = ir.registrar_id
            WHERE ir.issuer_id = x.id
          ) LIKE ?
          OR (
            SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
            FROM master_issuer_rating mir
            WHERE mir.issuer_id = x.id
          ) LIKE ?
          OR (
            SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
            FROM issuer_arranger ia
            JOIN master_arranger ma ON ma.id = ia.arranger_id
            WHERE ia.issuer_id = x.id
          ) LIKE ?
          OR security_name LIKE ?
          OR s.description LIKE ?
          OR mi.description LIKE ?
          OR CAST(issue_size AS CHAR) LIKE ?
          OR CAST(face_value AS CHAR) LIKE ?
          OR (
            SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
            FROM master_issuer_rating mir
            JOIN master_agency mag ON mag.id = mir.agency_id
            WHERE mir.issuer_id = x.id
          ) LIKE ?
          OR mstc.description LIKE ?
          OR tf.description LIKE ?
          OR msf.description LIKE ?
          OR (
            SELECT mls.description
            FROM master_issuer_stock_exchange mise
            LEFT JOIN master_listing_status mls
                ON mls.code = mise.listing_status
            WHERE mise.issuer_id = x.id
            ORDER BY mise.listing_status
            LIMIT 1
          ) LIKE ?
        )
      ` : ''}
    `;

    const countParams = [
      parsedTrusteeId,
      sqlStartDate,
      sqlEndDate,
    ];

    if (searchPattern) {
      countParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    // =========================
    // EXECUTE QUERIES
    // =========================

    const [data, totalCount] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams),
    ]);

    return res.json({
      success: true,
      totalRecords: Number(totalCount[0]?.total || 0),
      data,
    });
  } catch (error) {
    console.error('trustee_issue_details error:', error);

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

      if (rating) {
        conditions.push(`mir.rating = ?`);
        params.push(rating);
      }

      if (dealSize) {
        conditions.push(`mi.issue_size LIKE ?`);
        params.push(`%${dealSize}%`);
      }

      if (listingStatus) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = mi.id AND mls.description = ?
        )`);
        params.push(listingStatus);
      }

      if (seniority) {
        conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = mi.seniority AND mstc.description = ?)`);
        params.push(seniority);
      }

      if (taxFree) {
        conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = mi.tax_free AND mtf.description = ?)`);
        params.push(taxFree);
      }

      if (securedFlag) {
        conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = mi.secured_flag AND msf.description = ?)`);
        params.push(securedFlag);
      }

      if (sector) {
        conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = mi.business_sector AND mbs.description = ?)`);
        params.push(sector);
      }

      if (nature) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_type_nature mitn WHERE mitn.code = mi.nature_type AND mitn.description = ?)`);
        params.push(nature);
      }

      if (ownershipType) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = mi.issuer_ownership_type AND miot.description = ?)`);
        params.push(ownershipType);
      }

      if (creditRatingAgency) {
        conditions.push(`ma.short_name = ?`);
        params.push(creditRatingAgency);
      }

      if (securityType) {
        conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = mi.security_class AND mst.description = ?)`);
        params.push(securityType);
      }

      if (modeOfIssue) {
        conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = mi.mode_issue AND mmi.description = ?)`);
        params.push(modeOfIssue);
      }

      if (isin) {
        conditions.push(`mi.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      if (registrar) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = mi.id AND mr.registrar_name LIKE ?
        )`);
        params.push(`%${registrar}%`);
      }

      return { conditions, params };
    };

    const { conditions: filterConditions, params: filterParams } = buildFilterConditions();
    const filterSql = filterConditions.length > 0 ? ' AND ' + filterConditions.join(' AND ') : '';

    /* ---------------- TOTALS (parameterized, no Cartesian product) ---------------- */

    const totalIssueSizeResult = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(t.issue_size), 0) AS aggregate
      FROM (
        SELECT DISTINCT mi.id, mi.issue_size
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        LEFT JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
      ) t
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalIssueSizePrevYearResult = await prisma.$queryRawUnsafe(`
      SELECT COALESCE(SUM(t.issue_size), 0) AS aggregate
      FROM (
        SELECT DISTINCT mi.id, mi.issue_size
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        LEFT JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
      ) t
    `, sqlPreviousStart, sqlPreviousEnd, ...filterParams);

    const totalIssuesCountCurrYearResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM (
        SELECT DISTINCT mi.id
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        LEFT JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
      ) t
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalIssuesCountPrevYearResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM (
        SELECT DISTINCT mi.id
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        LEFT JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
      ) t
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
        t1.issuer_name,
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
          ma.short_name AS issuer_name,
          COUNT(DISTINCT mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
        GROUP BY ma.id, ma.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(DISTINCT mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(DISTINCT mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
        GROUP BY ma.id, ma.short_name
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    } else {
      tableQuery = `
      SELECT
        t1.id,
        t1.issuer_name,
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
          ma.short_name AS issuer_name,
          COUNT(DISTINCT mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}
        GROUP BY ma.id, ma.short_name
        ORDER BY arr_rank
        ${limitOffsetSql}
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(DISTINCT mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN ? AND ?
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
      SELECT COUNT(DISTINCT ma.id) AS total
      FROM master_issuer mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${filterSql}
    `, sqlCurrentStart, sqlCurrentEnd, ...filterParams);

    const totalRecords = Number(totalCountResult[0]?.total) || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(DISTINCT mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankedAgenciesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        ma.id AS agency_id,
        ma.short_name AS agency_name,
        RANK() OVER (
          ORDER BY COUNT(DISTINCT mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ?
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
          ORDER BY SUM(mi.issue_size) DESC, COUNT(DISTINCT mi.isin) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${filterSql}
      GROUP BY ma.id, ma.short_name
      ORDER BY arr_rank
      LIMIT 10
    `;

    const sectorQuery = `
      SELECT
        r.agency_id AS id,
        r.agency_name AS issuer_name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedAgenciesSubQuery}) r
      JOIN master_issuer_rating mir ON mir.agency_id = r.agency_id
      JOIN master_issuer mi ON mi.id = mir.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${filterSql}
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

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery,
      sqlCurrentStart, sqlCurrentEnd, ...filterParams,
      sqlCurrentStart, sqlCurrentEnd, ...filterParams
    );

    /* ---------------- RESPONSE FORMAT ---------------- */

    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.issuer_name ?? '-',
      currentSize: item.cy_issue_size ?? '-',
      currentDeals: item.cy_issues ?? '-',
      currentMarketShare: item.cy_mkt_share ?? '-',
      previousRank: item.py_arr_rank ?? '-',
      previousSize: item.py_issue_size ?? '-',
      previousDeals: item.py_issues ?? '-',
      previousMarketShare: item.py_mkt_share ?? '-',
      yoyChange: item.yoy ?? '-'
    }));

    res.status(200).json({
      tableData: finalResult,
      sectorData,
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
    const {
      startDate,
      endDate,
      id,
      rating = "",
      registrar = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
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

      if (rating) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir_sub WHERE mir_sub.issuer_id = ${issuerAlias}.id AND mir_sub.rating = ?)`);
        params.push(rating);
      }

      if (dealSize) {
        conditions.push(`${issuerAlias}.issue_size LIKE ?`);
        params.push(`%${dealSize}%`);
      }

      if (listingStatus) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = ${issuerAlias}.id AND mls.description = ?
        )`);
        params.push(listingStatus);
      }

      if (seniority) {
        conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = ${issuerAlias}.seniority AND mstc.description = ?)`);
        params.push(seniority);
      }

      if (taxFree) {
        conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = ${issuerAlias}.tax_free AND mtf.description = ?)`);
        params.push(taxFree);
      }

      if (securedFlag) {
        conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = ${issuerAlias}.secured_flag AND msf.description = ?)`);
        params.push(securedFlag);
      }

      if (sector) {
        conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = ${issuerAlias}.business_sector AND mbs.description = ?)`);
        params.push(sector);
      }

      if (nature) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_type_nature mitn WHERE mitn.code = ${issuerAlias}.nature_type AND mitn.description = ?)`);
        params.push(nature);
      }

      if (ownershipType) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = ${issuerAlias}.issuer_ownership_type AND miot.description = ?)`);
        params.push(ownershipType);
      }

      if (creditRatingAgency) {
        conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir_sub2 JOIN master_agency ma_sub ON ma_sub.id = mir_sub2.agency_id WHERE mir_sub2.issuer_id = ${issuerAlias}.id AND ma_sub.short_name = ?)`);
        params.push(creditRatingAgency);
      }

      if (securityType) {
        conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = ${issuerAlias}.security_class AND mst.description = ?)`);
        params.push(securityType);
      }

      if (modeOfIssue) {
        conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = ${issuerAlias}.mode_issue AND mmi.description = ?)`);
        params.push(modeOfIssue);
      }

      if (isin) {
        conditions.push(`${issuerAlias}.isin LIKE ?`);
        params.push(`%${isin}%`);
      }

      if (registrar) {
        conditions.push(`EXISTS (
          SELECT 1 FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = ${issuerAlias}.id AND mr.registrar_name LIKE ?
        )`);
        params.push(`%${registrar}%`);
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
      INNER JOIN master_issuer i ON i.id = mir.issuer_id
      LEFT JOIN master_agency ON master_agency.id = mir.agency_id
      WHERE i.allotment_date BETWEEN ? AND ?
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
        LEFT JOIN master_issuer i ON i.id = mir.issuer_id
        WHERE i.allotment_date BETWEEN ? AND ?
          ${filterSql}
          AND master_agency.id = ?
        GROUP BY mir.rating
      `;
      queryParams = [sqlStartDate, sqlEndDate, ...filterParams, parsedId];
    } else {
      // Overview: one row per agency with modal rating
      // Fix: Use a simpler, correct approach - count ratings per agency and pick modal
      creditRatingQuery = `
        WITH agency_stats AS (
          SELECT
            ma.id AS agency_id,
            ma.short_name AS agency_name,
            mir.rating,
            COUNT(*) AS rating_count,
            ROW_NUMBER() OVER (
              PARTITION BY ma.id
              ORDER BY COUNT(*) DESC, mir.rating ASC
            ) AS rn
          FROM master_agency ma
          INNER JOIN master_issuer_rating mir ON mir.agency_id = ma.id
          INNER JOIN master_issuer i ON i.id = mir.issuer_id
          WHERE i.allotment_date BETWEEN ? AND ?
            ${filterSql}
          GROUP BY ma.id, ma.short_name, mir.rating
        ),
        agency_totals AS (
          SELECT
            agency_id,
            SUM(rating_count) AS total_count
          FROM agency_stats
          GROUP BY agency_id
        )
        SELECT
          ast.agency_name AS label,
          ROUND((ast.rating_count / at.total_count) * 100, 2) AS percentage,
          ast.rating_count AS rating_no,
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'), -6)) AS color,
          ast.rating
        FROM agency_stats ast
        JOIN agency_totals at ON at.agency_id = ast.agency_id
        WHERE ast.rn = 1
        ORDER BY ast.rating_count DESC
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
  const {
    startDate = '2025-01-01',
    endDate = '2026-01-01',
    limit = 25,
    offset = 0,
    issuerName = "",
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

  try {
    // ---------------------
    // INPUT VALIDATION
    // ---------------------
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ error: 'limit must be a non-negative integer' });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }

    // Validate and format dates
    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // ---------------------
    // Dynamic WHERE conditions
    // ---------------------
    const conditions = [];
    const params = [];

    // Base conditions
    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM master_issuer_rating mir
        WHERE mir.issuer_id = master_issuer.id
      )
    `);

    // ---------------------
    // Filters (using EXISTS for one-to-many to avoid Cartesian product)
    // ---------------------
    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = master_issuer.id AND mir.rating = ?)`);
      params.push(rating);
    }

    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = master_issuer.id AND mls.description = ?
      )`);
      params.push(listingStatus);
    }

    if (seniority) {
      conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = master_issuer.seniority AND mstc.description = ?)`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = master_issuer.tax_free AND mtf.description = ?)`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = master_issuer.secured_flag AND msf.description = ?)`);
      params.push(securedFlag);
    }

    if (sector) {
      conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = master_issuer.business_sector AND mbs.description = ?)`);
      params.push(sector);
    }

    if (trustee) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_trustee it JOIN master_trustee mt ON mt.id = it.trustee_id WHERE it.issuer_id = master_issuer.id AND mt.short_name LIKE ?)`);
      params.push(`%${trustee}%`);
    }

    if (nature) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_type_nature mitn WHERE mitn.code = master_issuer.nature_type AND mitn.description = ?)`);
      params.push(nature);
    }

    if (ownershipType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = master_issuer.issuer_ownership_type AND miot.description = ?)`);
      params.push(ownershipType);
    }

    if (creditRatingAgency) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency ma2 ON ma2.id = mir2.agency_id WHERE mir2.issuer_id = master_issuer.id AND ma2.short_name = ?)`);
      params.push(creditRatingAgency);
    }

    if (securityType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = master_issuer.security_class AND mst.description = ?)`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = master_issuer.mode_issue AND mmi.description = ?)`);
      params.push(modeOfIssue);
    }

    if (isin) {
      conditions.push(`master_issuer.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (arranger) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_arranger ia JOIN master_arranger ma ON ma.id = ia.arranger_id WHERE ia.issuer_id = master_issuer.id AND ma.short_name LIKE ?)`);
      params.push(`%${arranger}%`);
    }

    if (registrar) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = master_issuer.id AND mr.registrar_name LIKE ?)`);
      params.push(`%${registrar}%`);
    }

    // ---------------------
    // WHERE clause
    // ---------------------
    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // ---------------------
    // Main data query (no Cartesian product)
    // ---------------------
    const dataQuery = `
      SELECT
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,

        issuer_details.issuer_name AS issuer_name,

        master_issuer_ownership_type.description AS ownership_type,

        master_issuer_type_nature.description AS nature,

        master_business_sector.description AS sector,

        master_security_type.description AS security_type,

        master_mode_issue.description AS mode_of_issue,

        master_seniority_tier_classification.description AS Seniority,

        master_tax_free.description AS tax_free,

        master_secured_flag.description AS secured_flag,

        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = master_issuer.id
        ) AS debenture_trustee,

        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = master_issuer.id
        ) AS Arranger,

        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = master_issuer.id
        ) AS Registrar,

        (
          SELECT GROUP_CONCAT(DISTINCT CONCAT(mag.short_name, ': ', mir.rating) SEPARATOR '; ')
          FROM master_issuer_rating mir
          JOIN master_agency mag ON mag.id = mir.agency_id
          WHERE mir.issuer_id = master_issuer.id
        ) AS credit_rating_info,

        (
          SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
          FROM master_issuer_rating mir
          WHERE mir.issuer_id = master_issuer.id
        ) AS credit_rating,

        (
          SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
          FROM master_issuer_rating mir
          JOIN master_agency mag ON mag.id = mir.agency_id
          WHERE mir.issuer_id = master_issuer.id
        ) AS credit_rating_agency,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange AS mise
          LEFT JOIN master_listing_status AS mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = master_issuer.id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status,

        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange AS mise
          WHERE mise.issuer_id = master_issuer.id
            AND mise.listing_status IS NOT NULL
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status_code,

        (
          SELECT icd.coupon_rate
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = master_issuer.id
          ORDER BY icd.id
          LIMIT 1
        ) AS coupon_rate

      FROM master_issuer

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

      ${whereClause}

      ORDER BY master_issuer.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ---------------------
    // Count query
    // ---------------------
    const countQuery = `
      SELECT COUNT(DISTINCT master_issuer.id) AS total
      FROM master_issuer

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

      ${whereClause}
    `;

    // ---------------------
    // Execute queries
    // ---------------------
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // ---------------------
    // Final formatting
    // ---------------------
    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date
        ? new Date(item?.allotment_date)
          .toISOString()
          .split('T')[0]
        : null;

      const maturity = item?.maturity_date
        ? new Date(item?.maturity_date)
          .toISOString()
          .split('T')[0]
        : null;

      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        allotmentDate:
          item?.allotment_date ? allotment : '-',
        maturityDate:
          item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate || '-',
        creditRatingAgency:
          item?.credit_rating_agency || '-',
        creditRating:
          item?.credit_rating || '-',
        debentureTrustee:
          item?.debenture_trustee || '-',
        registrar: item?.Registrar || '-',
        arranger: item?.Arranger || '-',
        seniority: item?.Seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        nature: item?.nature || '-',
        ownershipType:
          item?.ownership_type || '-',
        sector: item?.sector || '-',
      };
    });

    // ---------------------
    // Response
    // ---------------------
    res.status(200).json({
      data: finalResult,

      pagination: {
        total: total,
        limit: parsedLimit,
        offset: parsedOffset,

        hasMore:
          (parsedOffset + parsedLimit) < total
      }
    });

  } catch (error) {
    console.error('AgencyPage detailed data API error:', error);

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
      endDate = '2026-03-31',

      ownershipType = "",
      sector = "",
      nature = "",
      securityType = "",
      creditRatingAgency = "",
      modeOfIssue = "",
      seniority = "",
      taxFree = "",
      listingStatus = "",
      securedFlag = "",
      rating = "",
      dealSize = ""
    } = req.body;

    /* ---------------------------------
       DATE VALIDATION
    --------------------------------- */

    const formatDateForSql = (dateStr) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateForSql(startDate);
    const sqlEndDate = formatDateForSql(endDate);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    /* ---------------------------------
       BUILD DYNAMIC CONDITIONS
    --------------------------------- */

    const conditions = [];
    const params = [];

    // Base date filter params
    params.push(sqlStartDate, sqlEndDate);

    // Rating
    if (rating) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir WHERE mir.issuer_id = mi.id AND mir.rating = ?)`);
      params.push(rating);
    }

    // Deal Size
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    // Ownership Type
    if (ownershipType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_ownership_type miot WHERE miot.code = mi.issuer_ownership_type AND miot.description = ?)`);
      params.push(ownershipType);
    }

    // Sector
    if (sector) {
      conditions.push(`EXISTS (SELECT 1 FROM master_business_sector mbs WHERE mbs.code = mi.business_sector AND mbs.description = ?)`);
      params.push(sector);
    }

    // Nature
    if (nature) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_type_nature mint WHERE mint.code = mi.nature_type AND mint.description = ?)`);
      params.push(nature);
    }

    // Security Type
    if (securityType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = mi.security_class AND mst.description = ?)`);
      params.push(securityType);
    }

    // Credit Rating Agency
    if (creditRatingAgency) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_rating mir2 JOIN master_agency mag2 ON mag2.id = mir2.agency_id WHERE mir2.issuer_id = mi.id AND mag2.short_name = ? AND mag2.parent_id = 0)`);
      params.push(creditRatingAgency);
    }

    // Mode Of Issue
    if (modeOfIssue) {
      conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = mi.mode_issue AND mmi.description = ?)`);
      params.push(modeOfIssue);
    }

    // Seniority
    if (seniority) {
      conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = mi.seniority AND mstc.description = ?)`);
      params.push(seniority);
    }

    // Tax Free
    if (taxFree) {
      conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = mi.tax_free AND mtf.description = ?)`);
      params.push(taxFree);
    }

    // Listing Status
    if (listingStatus) {
      conditions.push(`EXISTS (SELECT 1 FROM master_issuer_stock_exchange mise JOIN master_listing_status mls ON mls.code = mise.listing_status WHERE mise.issuer_id = mi.id AND mls.description = ?)`);
      params.push(listingStatus);
    }

    // Secured Flag
    if (securedFlag) {
      conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = mi.secured_flag AND msf.description = ?)`);
      params.push(securedFlag);
    }

    const filterSql = conditions.length > 0
      ? ' AND ' + conditions.join(' AND ')
      : '';

    /* ---------------------------------
       MAIN QUERY
    --------------------------------- */

    const query = `
      SELECT
          am.month_no AS issue_month_no,
          MONTHNAME(STR_TO_DATE(CONCAT(am.month_no, '-01'), '%m-%d')) AS issue_month,
          COALESCE(fd.no_of_issue, 0) AS no_of_issue,
          COALESCE(ROUND(fd.total_issue_size / 10000000, 2), 0) AS issue_size,
          COALESCE(fd.total_issue_size, 0) AS actual_issue_size
      FROM all_months am
      LEFT JOIN (
SELECT
    MONTH(mi.allotment_date) AS issue_month,

    COUNT(
        DISTINCT CONCAT(
          mi.id,
          '-',
          COALESCE(mir.id, '')
        )
        ) AS no_of_issue,

        SUM(mi.issue_size) AS total_issue_size

        FROM master_issuer mi

        LEFT JOIN master_issuer_rating mir
            ON mir.issuer_id = mi.id

        WHERE mi.allotment_date BETWEEN ? AND ?
        ${filterSql}

        GROUP BY MONTH(mi.allotment_date)
        ) fd ON fd.issue_month = am.month_no
        ORDER BY CAST(am.month_no AS UNSIGNED) ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    const finalResult = result.map((item) => ({
      issueMonthNo: item?.issue_month_no || '-',
      issueMonth: item?.issue_month || '-',
      noOfIssue: Number(item?.no_of_issue || 0),
      issueSize: Number(item?.issue_size || 0),
      actualIssueSize: Number(item?.actual_issue_size || 0)
    }));

    res.status(200).json({
      totalRows: finalResult.length,
      data: finalResult
    });

  } catch (error) {
    console.error('Rating agencies monthly summary API error:', error);

    res.status(500).json({
      error: 'Failed to fetch rating agencies monthly summary data',
      message: error.message
    });
  }
});

app.post('/rating_agencies_page_monthly_detailed_data', async (req, res) => {
  const {
    startDate = '2026-04-01',
    endDate = '2026-05-28',

    limit = 25,
    offset = 0,

    issueMonth = "",

    issuerName = "",
    rating = "",
    registrar = "",
    arranger = "",
    seniority = "",
    taxFree = "",
    securedFlag = "",
    trustee = "",
    creditRatingAgency = "",
    listingStatus = "",
    securityType = "",
    modeOfIssue = "",
    isin = "",
    securityName = ""
  } = req.body;

  try {
    // -----------------------------------
    // INPUT VALIDATION
    // -----------------------------------
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        message: 'limit must be a non-negative integer'
      });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'offset must be a non-negative integer'
      });
    }

    const parsedMonth = issueMonth ? parseInt(issueMonth, 10) : null;
    if (issueMonth && (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12)) {
      return res.status(400).json({
        success: false,
        message: 'issueMonth must be an integer between 1 and 12'
      });
    }

    // Validate and format dates
    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sqlStartDate = formatDateTime(startDate, false);
    const sqlEndDate = formatDateTime(endDate, true);

    if (!sqlStartDate || !sqlEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    // -----------------------------------
    // Dynamic WHERE conditions
    // -----------------------------------
    const conditions = [];
    const params = [];

    // Base conditions
    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(sqlStartDate, sqlEndDate);

    // -----------------------------------
    // Filters
    // -----------------------------------

    if (parsedMonth) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(parsedMonth);
    }

    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`mir.rating LIKE ?`);
      params.push(`%${rating}%`);
    }

    if (registrar) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_registrar ir JOIN master_registrar mr ON mr.id = ir.registrar_id WHERE ir.issuer_id = i.id AND mr.registrar_name LIKE ?)`);
      params.push(`%${registrar}%`);
    }

    if (arranger) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_arranger ia JOIN master_arranger ma ON ma.id = ia.arranger_id WHERE ia.issuer_id = i.id AND ma.short_name LIKE ?)`);
      params.push(`%${arranger}%`);
    }

    if (seniority) {
      conditions.push(`EXISTS (SELECT 1 FROM master_seniority_tier_classification mstc WHERE mstc.code = i.seniority AND mstc.description = ?)`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`EXISTS (SELECT 1 FROM master_tax_free mtf WHERE mtf.code = i.tax_free AND mtf.description = ?)`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`EXISTS (SELECT 1 FROM master_secured_flag msf WHERE msf.code = i.secured_flag AND msf.description = ?)`);
      params.push(securedFlag);
    }

    if (trustee) {
      conditions.push(`EXISTS (SELECT 1 FROM issuer_trustee it JOIN master_trustee mt ON mt.id = it.trustee_id WHERE it.issuer_id = i.id AND mt.short_name LIKE ?)`);
      params.push(`%${trustee}%`);
    }

    if (creditRatingAgency) {
      conditions.push(`mag.short_name = ?`);
      params.push(creditRatingAgency);
    }

    if (listingStatus) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM master_issuer_stock_exchange mise2
          LEFT JOIN master_listing_status mls2
            ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.id
          AND mls2.description = ?
        )
      `);
      params.push(listingStatus);
    }

    if (securityType) {
      conditions.push(`EXISTS (SELECT 1 FROM master_security_type mst WHERE mst.code = i.security_class AND mst.description = ?)`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`EXISTS (SELECT 1 FROM master_mode_issue mmi WHERE mmi.code = i.mode_issue AND mmi.description = ?)`);
      params.push(modeOfIssue);
    }

    if (isin) {
      conditions.push(`i.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (securityName) {
      conditions.push(`i.security_name LIKE ?`);
      params.push(`%${securityName}%`);
    }

    // -----------------------------------
    // WHERE clause
    // -----------------------------------
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // -----------------------------------
    // Main Data Query (no Cartesian product)
    // -----------------------------------
    const dataQuery = `
      SELECT
        i.id AS issuerId,
        i.isin,
        mag.short_name AS agency_name,
        mir.rating AS rating_value,
        id.issuer_name,
        i.allotment_date,
        i.maturity_date,
        i.security_name,
        i.issue_size,
        i.face_value,
        i.issuer_master_id,

        s.description AS security_type,
        mi.description AS mode_issue,
        mstc.description AS seniority,
        tf.description AS tax_free,
        msf.description AS secured_flag,

        

        (
          SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
          FROM issuer_coupon_details icd
          WHERE icd.issuer_id = i.id
        ) AS coupon_rate,

        (
          SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
          FROM issuer_trustee it
          JOIN master_trustee mt ON mt.id = it.trustee_id
          WHERE it.issuer_id = i.id
        ) AS debenture_trustee_name,

        (
          SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
          FROM issuer_registrar ir
          JOIN master_registrar mr ON mr.id = ir.registrar_id
          WHERE ir.issuer_id = i.id
        ) AS registrar_detail,

        (
          SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
          FROM issuer_arranger ia
          JOIN master_arranger ma ON ma.id = ia.arranger_id
          WHERE ia.issuer_id = i.id
        ) AS arranger_name,

        (
          SELECT mls.description
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls
            ON mls.code = mise.listing_status
          WHERE mise.issuer_id = i.id
          ORDER BY mise.listing_status
          LIMIT 1
        ) AS listing_status

      FROM master_issuer AS i

      LEFT JOIN issuer_details AS id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
        ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification AS mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
        ON msf.code = i.secured_flag

      LEFT JOIN master_issuer_rating AS mir
        ON mir.issuer_id = i.id

      LEFT JOIN master_agency AS mag
        ON mag.id = mir.agency_id

      ${whereClause}

      GROUP BY i.id, mag.short_name, mir.rating, i.isin, id.issuer_name, i.allotment_date, i.maturity_date,
               i.security_name, i.issue_size, i.face_value, i.issuer_master_id,
               s.description, mi.description, mstc.description, tf.description,
               msf.description, mag.short_name, mir.rating

      ORDER BY issuer_name ASC

      LIMIT ? OFFSET ?
    `;

    // -----------------------------------
    // Count Query
    // -----------------------------------
    const countQuery = `
      SELECT COUNT(DISTINCT CONCAT(i.id, '-', COALESCE(mir.id, ''))) AS total
      FROM master_issuer AS i

      LEFT JOIN issuer_details AS id
        ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
        ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
        ON i.mode_issue = mi.code

      LEFT JOIN master_seniority_tier_classification AS mstc
        ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
        ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
        ON msf.code = i.secured_flag

      LEFT JOIN master_issuer_rating AS mir
        ON mir.issuer_id = i.id

      LEFT JOIN master_agency AS mag
        ON mag.id = mir.agency_id

      ${whereClause}
    `;

    // -----------------------------------
    // Execute Queries
    // -----------------------------------
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = Number(countResult?.[0]?.total) || 0;

    // -----------------------------------
    // Final Formatting
    // -----------------------------------
    const formattedData = result?.map((item) => {

      const allotmentDate = item?.allotment_date
        ? new Date(item.allotment_date)
          .toISOString()
          .split('T')[0]
        : '-';

      const maturityDate = item?.maturity_date
        ? new Date(item.maturity_date)
          .toISOString()
          .split('T')[0]
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
        issueSize: item?.issue_size || 0,
        faceValue: item?.face_value || 0,
        creditRatingAgency: item?.agency_name || '-',
        seniority: item?.seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',
        issuerMasterId: item?.issuer_master_id || '-'
      };
    });

    // -----------------------------------
    // Response
    // -----------------------------------
    return res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        total: total,
        limit: parsedLimit,
        offset: parsedOffset,
        hasMore: parsedOffset + parsedLimit < total
      }
    });

  } catch (error) {
    console.error('Rating agencies monthly detailed API error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly issuer detailed data',
      error: error.message
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
    } = req.body;

    // =========================
    // INPUT VALIDATION
    // =========================
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

    // Validate and format dates
    const formatDateTime = (dateStr, isEnd = false) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      if (isEnd) {
        date.setHours(23, 59, 59, 0);
      } else {
        date.setHours(0, 0, 0, 0);
      }
      return date.toISOString().slice(0, 19).replace('T', ' ');
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
      String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // =========================
    // SEARCH CONFIGURATION
    // =========================
    const searchTerm = SearchQuery?.trim() || '';
    const searchPattern = searchTerm ? `%${searchTerm}%` : null;

    // =========================
    // DATA QUERY (parameterized, no Cartesian product)
    // =========================
    const dataQuery = `
      SELECT *
      FROM (
          SELECT
              i.id AS issuerId,
              i.isin,
              id.issuer_name,
              i.allotment_date,
              i.maturity_date,
              i.security_name,
              i.issue_size,
              i.face_value,
              i.issuer_master_id,

              (
                  SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
                  FROM issuer_coupon_details icd
                  WHERE icd.issuer_id = i.id
              ) AS coupon_rate,

              (
                  SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
                  FROM issuer_trustee it
                  JOIN master_trustee mt ON mt.id = it.trustee_id
                  WHERE it.issuer_id = i.id
              ) AS debenture_trustee_name,

              (
                  SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
                  FROM issuer_registrar ir
                  JOIN master_registrar mr ON mr.id = ir.registrar_id
                  WHERE ir.issuer_id = i.id
              ) AS registrar_detail,

              (
                  SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
                  FROM master_issuer_rating mir
                  WHERE mir.issuer_id = i.id
              ) AS rating,

              (
                  SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
                  FROM issuer_arranger ia
                  JOIN master_arranger ma ON ma.id = ia.arranger_id
                  WHERE ia.issuer_id = i.id
              ) AS arranger_name,

              s.description AS security_type,

              mi.description AS mode_issue,

              (
                  SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
                  FROM master_issuer_rating mir
                  JOIN master_agency mag ON mag.id = mir.agency_id
                  WHERE mir.issuer_id = i.id
              ) AS agency_name,

              mstc.description AS seniority,

              tf.description AS tax_free,

              msf.description AS secured_flag,

              (
                  SELECT mls.description
                  FROM master_issuer_stock_exchange mise
                  LEFT JOIN master_listing_status mls
                      ON mls.code = mise.listing_status
                  WHERE mise.issuer_id = i.id
                  ORDER BY mise.listing_status
                  LIMIT 1
              ) AS listing_status

          FROM master_issuer i

          INNER JOIN master_issuer_rating mir
              ON i.id = mir.issuer_id
              AND mir.agency_id = ?

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

          WHERE i.allotment_date BETWEEN ? AND ?
      ) x

      WHERE 1 = 1
      ${searchPattern ? `
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
      ` : ''}

      ORDER BY ${orderBy} ${orderDirection}

      LIMIT ? OFFSET ?
    `;

    const dataParams = [
      parsedAgencyId,
      sqlStartDate,
      sqlEndDate,
    ];

    if (searchPattern) {
      dataParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    dataParams.push(parsedLimit, parsedOffset);

    // =========================
    // COUNT QUERY
    // =========================
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
          SELECT i.id
          FROM master_issuer i

          INNER JOIN master_issuer_rating mir
              ON i.id = mir.issuer_id
              AND mir.agency_id = ?

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

          WHERE i.allotment_date BETWEEN ? AND ?

          ${searchPattern ? `
            AND (
              id.issuer_name LIKE ?
              OR i.isin LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT icd.coupon_rate SEPARATOR ', ')
                FROM issuer_coupon_details icd
                WHERE icd.issuer_id = i.id
              ) LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT mt.short_name SEPARATOR ', ')
                FROM issuer_trustee it
                JOIN master_trustee mt ON mt.id = it.trustee_id
                WHERE it.issuer_id = i.id
              ) LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT mr.registrar_name SEPARATOR ', ')
                FROM issuer_registrar ir
                JOIN master_registrar mr ON mr.id = ir.registrar_id
                WHERE ir.issuer_id = i.id
              ) LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT mir.rating SEPARATOR ', ')
                FROM master_issuer_rating mir
                WHERE mir.issuer_id = i.id
              ) LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT ma.short_name SEPARATOR ', ')
                FROM issuer_arranger ia
                JOIN master_arranger ma ON ma.id = ia.arranger_id
                WHERE ia.issuer_id = i.id
              ) LIKE ?
              OR i.security_name LIKE ?
              OR s.description LIKE ?
              OR mi.description LIKE ?
              OR CAST(i.issue_size AS CHAR) LIKE ?
              OR CAST(i.face_value AS CHAR) LIKE ?
              OR (
                SELECT GROUP_CONCAT(DISTINCT mag.short_name SEPARATOR ', ')
                FROM master_issuer_rating mir
                JOIN master_agency mag ON mag.id = mir.agency_id
                WHERE mir.issuer_id = i.id
              ) LIKE ?
              OR mstc.description LIKE ?
              OR tf.description LIKE ?
              OR msf.description LIKE ?
              OR (
                SELECT mls.description
                FROM master_issuer_stock_exchange mise
                LEFT JOIN master_listing_status mls
                    ON mls.code = mise.listing_status
                WHERE mise.issuer_id = i.id
                ORDER BY mise.listing_status
                LIMIT 1
              ) LIKE ?
            )
          ` : ''}
      ) t
    `;

    const countParams = [
      parsedAgencyId,
      sqlStartDate,
      sqlEndDate,
    ];

    if (searchPattern) {
      countParams.push(
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern, searchPattern, searchPattern, searchPattern,
        searchPattern
      );
    }

    // =========================
    // EXECUTE QUERIES
    // =========================
    const [data, totalCount] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...dataParams),
      prisma.$queryRawUnsafe(countQuery, ...countParams),
    ]);

    return res.json({
      success: true,
      totalRecords: Number(totalCount?.[0]?.total || 0),
      data,
    });
  } catch (error) {
    console.error('rating_agency top_participants_details error:', error);

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
      nature = "",
      ownershipType = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

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

    // Validate issueType
    const validIssueTypes = ['count', 'issue_size'];
    const effectiveIssueType = validIssueTypes.includes(issueType) ? issueType : 'issue_size';

    /* ─────────────── COMMON FILTER BUILDER (excludes registrar) ─────────────── */
    const buildCommonFilters = (alias) => {
      const joins = [];
      const conditions = [];
      const params = [];

      if (listingStatus) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_stock_exchange mise
          JOIN master_listing_status mls ON mls.code = mise.listing_status
          WHERE mise.issuer_id = ${alias}.id AND mls.description = ?
        )`);
        params.push(listingStatus);
      }

      if (rating) {
        conditions.push(`EXISTS (
          SELECT 1 FROM master_issuer_rating mir
          WHERE mir.issuer_id = ${alias}.id AND mir.rating = ?
        )`);
        params.push(rating);
      }

      if (seniority) {
        joins.push(`LEFT JOIN master_seniority_tier_classification mstc ON mstc.code = ${alias}.seniority`);
        conditions.push(`mstc.description = ?`);
        params.push(seniority);
      }

      if (taxFree) {
        joins.push(`LEFT JOIN master_tax_free mtf ON mtf.code = ${alias}.tax_free`);
        conditions.push(`mtf.description = ?`);
        params.push(taxFree);
      }

      if (securedFlag) {
        joins.push(`LEFT JOIN master_secured_flag msf ON msf.code = ${alias}.secured_flag`);
        conditions.push(`msf.description = ?`);
        params.push(securedFlag);
      }

      if (sector) {
        joins.push(`LEFT JOIN master_business_sector mbs ON mbs.code = ${alias}.business_sector`);
        conditions.push(`mbs.description = ?`);
        params.push(sector);
      }

      if (nature) {
        joins.push(`LEFT JOIN master_issuer_type_nature mitn ON mitn.code = ${alias}.nature_type`);
        conditions.push(`mitn.description = ?`);
        params.push(nature);
      }

      if (ownershipType) {
        joins.push(`LEFT JOIN master_issuer_ownership_type miot ON miot.code = ${alias}.issuer_ownership_type`);
        conditions.push(`miot.description = ?`);
        params.push(ownershipType);
      }

      if (dealSize) {
        conditions.push(`${alias}.issue_size LIKE ?`);
        params.push(`%${dealSize}%`);
      }

      if (securityType) {
        joins.push(`LEFT JOIN master_security_type mst ON mst.code = ${alias}.security_class`);
        conditions.push(`mst.description = ?`);
        params.push(securityType);
      }

      if (modeOfIssue) {
        joins.push(`LEFT JOIN master_mode_issue mmi ON mmi.code = ${alias}.mode_issue`);
        conditions.push(`mmi.description = ?`);
        params.push(modeOfIssue);
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

    /* ── TOTALS (common filters only) ── */
    const totalIssueSizePromise = prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer mi
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${commonWhereSql}
    `, currStartStr, currEndStr, ...commonParams);

    const totalIssueSizePrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer mi
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${commonWhereSql}
    `, prevStartStr, prevEndStr, ...commonParams);

    const totalIssuesCountCurrYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer mi
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${commonWhereSql}
    `, currStartStr, currEndStr, ...commonParams);

    const totalIssuesCountPrevYearPromise = prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer mi
      ${commonJoinsSql}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${commonWhereSql}
    `, prevStartStr, prevEndStr, ...commonParams);

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
    const registrarWhere = registrar ? `AND mr.registrar_name LIKE ?` : '';
    const registrarParam = registrar ? `%${registrar}%` : null;
    const tableBaseParams = registrar ? [...commonParams, registrarParam] : [...commonParams];

    const t1t2Joins = commonJoinsSql;
    const t1t2Where = `${commonWhereSql} ${registrarWhere}`;

    const paginationClause = parsedLimit !== null && parsedLimit > 0
      ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}`
      : '';

    let tableQuery = '';

    if (effectiveIssueType === 'count') {
      tableQuery = `
      SELECT
        t1.id,
        t1.issuer_name,
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
          mr.short_name AS issuer_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${t1t2Where}
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        ${paginationClause}
      ) t1
      LEFT JOIN (
        SELECT
          mr.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${t1t2Where}
        GROUP BY ir.registrar_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    } else {
      tableQuery = `
      SELECT
        t1.id,
        t1.issuer_name,
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
          mr.short_name AS issuer_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${t1t2Where}
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        ${paginationClause}
      ) t1
      LEFT JOIN (
        SELECT
          mr.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        ${t1t2Joins}
        WHERE mi.allotment_date BETWEEN ? AND ?
        ${t1t2Where}
        GROUP BY ir.registrar_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    // Parameters for table query: [marketShareDenomCurr, marketShareDenomPrev, t1Params..., t2Params...]
    const tableParams = effectiveIssueType === 'count'
      ? [safeTotalIssuesCount, safeTotalIssuesCountPrev, ...tableBaseParams, currStartStr, currEndStr, ...tableBaseParams, prevStartStr, prevEndStr]
      : [safeTotalIssueSize, safeTotalIssueSizePrev, ...tableBaseParams, currStartStr, currEndStr, ...tableBaseParams, prevStartStr, prevEndStr];

    const tableResult = await prisma.$queryRawUnsafe(tableQuery, ...tableParams);

    /* ── TOTAL COUNT ── */
    const countJoins = `${commonJoinsSql}\n${registrar ? 'LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id' : ''}`;
    const countWhere = `${commonWhereSql} ${registrarWhere}`;
    const countParams = registrar ? [...commonParams, `%${registrar}%`] : [...commonParams];

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id) AS total
      FROM master_issuer mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      ${countJoins}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${countWhere}
    `, currStartStr, currEndStr, ...countParams);

    const totalRecords = safeNumber(totalCountResult[0]?.total);

    /* ── SECTOR BREAKUP QUERY ── */
    const sectorValueSelect =
      effectiveIssueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    const rankJoins = commonJoinsSql;
    const rankWhere = `${commonWhereSql} ${registrarWhere}`;
    const rankParams = registrar ? [...commonParams, `%${registrar}%`] : [...commonParams];

    const rankedRegistrarsSubQuery =
      effectiveIssueType === 'count'
        ? `
      SELECT
        mr.id AS registrar_id,
        mr.short_name AS registrar_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      ${rankJoins}
      WHERE mi.allotment_date BETWEEN ? AND ?
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
          ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      ${rankJoins}
      WHERE mi.allotment_date BETWEEN ? AND ?
      ${rankWhere}
      GROUP BY ir.registrar_id
      ORDER BY arr_rank
      LIMIT 10
    `;

    const sectorCommonJoins = commonFilters.joins.filter(j => !j.includes('master_business_sector')).join('\n');
    const sectorJoins = `${sectorCommonJoins}\n${registrar ? 'LEFT JOIN master_registrar mr ON mr.id = ir.registrar_id' : ''}`;
    const sectorWhere = `${commonWhereSql} ${registrarWhere}`;
    const sectorParams = registrar ? [...commonParams, `%${registrar}%`] : [...commonParams];

    const sectorQuery = `
      SELECT
        r.registrar_id AS id,
        r.registrar_name AS issuer_name,
        r.arr_rank,
        mbs.code,
        mbs.description,
        ${sectorValueSelect} AS value
      FROM (${rankedRegistrarsSubQuery}) r
      JOIN issuer_registrar ir ON ir.registrar_id = r.registrar_id
      JOIN master_issuer mi ON mi.id = ir.issuer_id
      JOIN master_business_sector mbs ON mi.business_sector = mbs.code
      ${sectorJoins}
      WHERE mi.allotment_date BETWEEN ? AND ?
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
      ...rankParams, currStartStr, currEndStr,
      ...sectorParams, currStartStr, currEndStr
    );

    /* ── RESPONSE FORMAT ── */
    const finalResult = tableResult.map((item) => ({
      id: item.id ?? '-',
      rank: item.cy_arr_rank ?? '-',
      name: item.issuer_name ?? '-',
      currentSize: item.cy_issue_size ?? '-',
      currentDeals: item.cy_issues ?? '-',
      currentMarketShare: item.cy_mkt_share ?? '-',
      previousRank: item.py_arr_rank ?? '-',
      previousSize: item.py_issue_size ?? '-',
      previousDeals: item.py_issues ?? '-',
      previousMarketShare: item.py_mkt_share ?? '-',
      yoyChange: item.yoy ?? '-'
    }));

    res.status(200).json({
      tableData: finalResult,
      sectorData,
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
    const {
      startDate,
      endDate,
      id,
      rating = "",
      registrar = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      sector = "",
      nature = "",
      ownershipType = "",
      dealSize = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      isin = ""
    } = req.body;

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

    // Validate id
    const parsedId = id !== undefined && id !== null ? parseInt(id, 10) : 0;
    const hasAgencyFilter = !isNaN(parsedId) && parsedId > 0;

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

    if (rating) {
      filterConditions.push(`master_issuer_rating.rating = ?`);
      filterParams.push(rating);
    }

    if (registrar) {
      filterJoins.push(`LEFT JOIN master_registrar ON master_registrar.id = issuer_registrar.registrar_id`);
      filterConditions.push(`master_registrar.registrar_name LIKE ?`);
      filterParams.push(`%${registrar}%`);
    }

    if (seniority) {
      filterJoins.push(`LEFT JOIN master_seniority_tier_classification ON master_seniority_tier_classification.code = master_issuer.seniority`);
      filterConditions.push(`master_seniority_tier_classification.description = ?`);
      filterParams.push(seniority);
    }

    if (taxFree) {
      filterJoins.push(`LEFT JOIN master_tax_free ON master_tax_free.code = master_issuer.tax_free`);
      filterConditions.push(`master_tax_free.description = ?`);
      filterParams.push(taxFree);
    }

    if (securedFlag) {
      filterJoins.push(`LEFT JOIN master_secured_flag ON master_secured_flag.code = master_issuer.secured_flag`);
      filterConditions.push(`master_secured_flag.description = ?`);
      filterParams.push(securedFlag);
    }

    if (sector) {
      filterJoins.push(`LEFT JOIN master_business_sector ON master_business_sector.code = master_issuer.business_sector`);
      filterConditions.push(`master_business_sector.description = ?`);
      filterParams.push(sector);
    }

    if (nature) {
      filterJoins.push(`LEFT JOIN master_issuer_type_nature ON master_issuer_type_nature.code = master_issuer.nature_type`);
      filterConditions.push(`master_issuer_type_nature.description = ?`);
      filterParams.push(nature);
    }

    if (ownershipType) {
      filterJoins.push(`LEFT JOIN master_issuer_ownership_type ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type`);
      filterConditions.push(`master_issuer_ownership_type.description = ?`);
      filterParams.push(ownershipType);
    }

    if (dealSize) {
      filterConditions.push(`master_issuer.issue_size LIKE ?`);
      filterParams.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      filterConditions.push(`EXISTS (
        SELECT 1 FROM master_issuer_stock_exchange mise
        JOIN master_listing_status mls ON mls.code = mise.listing_status
        WHERE mise.issuer_id = master_issuer.id AND mls.description = ?
      )`);
      filterParams.push(listingStatus);
    }

    if (securityType) {
      filterJoins.push(`LEFT JOIN master_security_type ON master_security_type.code = master_issuer.security_class`);
      filterConditions.push(`master_security_type.description = ?`);
      filterParams.push(securityType);
    }

    if (modeOfIssue) {
      filterJoins.push(`LEFT JOIN master_mode_issue ON master_mode_issue.code = master_issuer.mode_issue`);
      filterConditions.push(`master_mode_issue.description = ?`);
      filterParams.push(modeOfIssue);
    }

    if (isin) {
      filterConditions.push(`master_issuer.isin LIKE ?`);
      filterParams.push(`%${isin}%`);
    }

    const joinsSql = filterJoins.join('\n');
    const conditionsSql = filterConditions.length > 0
      ? `AND ${filterConditions.join(' AND ')}`
      : '';

    // ── TOTAL RATINGS (denominator) ──
    const totalQuery = `
      SELECT COUNT(*) AS aggregate
      FROM master_issuer_rating
      INNER JOIN master_issuer
        ON master_issuer.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = master_issuer.id
      ${joinsSql}
      WHERE master_issuer.allotment_date BETWEEN ? AND ?
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
    const agencyFilterSql = hasAgencyFilter ? 'AND master_agency.id = ?' : '';

    // When filtering by agency (id > 0), group by rating to show rating distribution for that agency
    // When no agency filter, group by agency_id to show agency distribution
    // Use MIN(rating) when grouping by agency to make GROUP BY deterministic
    const groupBySql = hasAgencyFilter
      ? 'GROUP BY master_issuer_rating.rating'
      : 'GROUP BY master_issuer_rating.agency_id';

    const ratingSelectSql = hasAgencyFilter
      ? 'master_issuer_rating.rating'
      : 'MIN(master_issuer_rating.rating) AS rating';

    const mainParams = [...filterParams];
    if (hasAgencyFilter) mainParams.push(parsedId);

    const creditRatingQuery = `
      SELECT
        master_agency.short_name AS label,

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

        ${ratingSelectSql}

      FROM master_agency

      INNER JOIN master_issuer_rating
        ON master_issuer_rating.agency_id = master_agency.id

      INNER JOIN master_issuer
        ON master_issuer.id = master_issuer_rating.issuer_id

      INNER JOIN issuer_registrar
        ON issuer_registrar.issuer_id = master_issuer.id

      ${joinsSql}

      WHERE master_issuer.allotment_date BETWEEN ? AND ?

      ${conditionsSql}

      ${agencyFilterSql}

      ${groupBySql}
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
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
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
  const {
    startDate = '2025-01-01',
    endDate = '2026-01-01',
    limit = 25,
    offset = 0,
    issuerName = "",
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

  try {
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
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // ── DYNAMIC WHERE CONDITIONS ──
    const conditions = [];
    const params = [];

    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ?`);
    params.push(startDate, endDate);

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM issuer_registrar ir
        WHERE ir.issuer_id = master_issuer.id
      )
    `);

    if (issuerName) {
      conditions.push(`issuer_details.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`master_issuer_rating.rating = ?`);
      params.push(rating);
    }

    if (dealSize) {
      conditions.push(`master_issuer.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      conditions.push(`listing_data.listing_status = ?`);
      params.push(listingStatus);
    }

    if (seniority) {
      conditions.push(`master_seniority_tier_classification.description = ?`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`master_tax_free.description = ?`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`master_secured_flag.description = ?`);
      params.push(securedFlag);
    }

    if (sector) {
      conditions.push(`master_business_sector.description = ?`);
      params.push(sector);
    }

    if (trustee) {
      conditions.push(`master_trustee.short_name LIKE ?`);
      params.push(`%${trustee}%`);
    }

    if (nature) {
      conditions.push(`master_issuer_type_nature.description = ?`);
      params.push(nature);
    }

    if (ownershipType) {
      conditions.push(`master_issuer_ownership_type.description = ?`);
      params.push(ownershipType);
    }

    if (creditRatingAgency) {
      conditions.push(`master_agency.short_name = ?`);
      params.push(creditRatingAgency);
    }

    if (securityType) {
      conditions.push(`master_security_type.description = ?`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`master_mode_issue.description = ?`);
      params.push(modeOfIssue);
    }

    if (isin) {
      conditions.push(`master_issuer.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (arranger) {
      conditions.push(`master_arranger.short_name LIKE ?`);
      params.push(`%${arranger}%`);
    }

    if (registrar) {
      conditions.push(`master_registrar.registrar_name LIKE ?`);
      params.push(`%${registrar}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // ── SAFE DATE FORMATTER ──
    const formatDateSafe = (dateVal) => {
      if (!dateVal) return null;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    };

    // ── MAIN DATA QUERY (GROUP BY to prevent Cartesian product) ──
    const dataQuery = `
      SELECT
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,
        MIN(master_trustee.short_name) AS debenture_trustee,
        MIN(master_arranger.short_name) AS Arranger,
        MIN(master_issuer_ownership_type.description) AS ownership_type,
        MIN(master_issuer_type_nature.description) AS nature,
        MIN(master_business_sector.description) AS sector,
        MIN(issuer_details.issuer_name) AS issuer_name,
        MIN(master_security_type.description) AS security_type,
        MIN(master_mode_issue.description) AS mode_of_issue,
        MIN(issuer_coupon_details.coupon_rate) AS coupon_rate,
        MIN(master_issuer_rating.rating) AS credit_rating,
        MIN(listing_data.listing_status) AS listing_status,
        MIN(listing_data.listing_status_code) AS listing_status_code,
        MIN(master_agency.short_name) AS credit_rating_agency,
        MIN(master_registrar.registrar_name) AS Registrar,
        MIN(master_seniority_tier_classification.description) AS Seniority,
        MIN(master_tax_free.description) AS tax_free,
        MIN(master_secured_flag.description) AS secured_flag

      FROM master_issuer

      LEFT JOIN (
        SELECT
          mise.issuer_id,
          MIN(mls.description) AS listing_status,
          MIN(mise.listing_status) AS listing_status_code
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls
          ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data
        ON listing_data.issuer_id = master_issuer.id

      LEFT JOIN issuer_trustee
        ON issuer_trustee.issuer_id = master_issuer.id

      LEFT JOIN master_trustee
        ON master_trustee.id = issuer_trustee.trustee_id

      LEFT JOIN issuer_arranger
        ON issuer_arranger.issuer_id = master_issuer.id

      LEFT JOIN master_arranger
        ON master_arranger.id = issuer_arranger.arranger_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN issuer_coupon_details
        ON issuer_coupon_details.issuer_id = issuer_details.id

      LEFT JOIN master_issuer_rating
        ON master_issuer_rating.issuer_id = master_issuer.id

      LEFT JOIN master_agency
        ON master_agency.id = master_issuer_rating.agency_id

      LEFT JOIN issuer_registrar
        ON issuer_registrar.issuer_id = master_issuer.id

      LEFT JOIN master_registrar
        ON master_registrar.id = issuer_registrar.registrar_id

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

      ${whereClause}

      GROUP BY master_issuer.id

      ORDER BY master_issuer.allotment_date ASC

      LIMIT ? OFFSET ?
    `;

    // ── COUNT QUERY ──
    const countQuery = `
      SELECT COUNT(DISTINCT master_issuer.id) AS total

      FROM master_issuer

      LEFT JOIN (
        SELECT
          mise.issuer_id,
          MIN(mls.description) AS listing_status,
          MIN(mise.listing_status) AS listing_status_code
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls
          ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id
      ) AS listing_data
        ON listing_data.issuer_id = master_issuer.id

      LEFT JOIN issuer_trustee
        ON issuer_trustee.issuer_id = master_issuer.id

      LEFT JOIN master_trustee
        ON master_trustee.id = issuer_trustee.trustee_id

      LEFT JOIN issuer_arranger
        ON issuer_arranger.issuer_id = master_issuer.id

      LEFT JOIN master_arranger
        ON master_arranger.id = issuer_arranger.arranger_id

      LEFT JOIN master_issuer_ownership_type
        ON master_issuer_ownership_type.code = master_issuer.issuer_ownership_type

      LEFT JOIN master_issuer_type_nature
        ON master_issuer_type_nature.code = master_issuer.nature_type

      LEFT JOIN master_business_sector
        ON master_business_sector.code = master_issuer.business_sector

      LEFT JOIN issuer_details
        ON issuer_details.id = master_issuer.issuer_master_id

      LEFT JOIN master_mode_issue
        ON master_mode_issue.code = master_issuer.mode_issue

      LEFT JOIN master_security_type
        ON master_security_type.code = master_issuer.security_class

      LEFT JOIN master_issuer_rating
        ON master_issuer_rating.issuer_id = master_issuer.id

      LEFT JOIN master_agency
        ON master_agency.id = master_issuer_rating.agency_id

      LEFT JOIN issuer_registrar
        ON issuer_registrar.issuer_id = master_issuer.id

      LEFT JOIN master_registrar
        ON master_registrar.id = issuer_registrar.registrar_id

      LEFT JOIN master_seniority_tier_classification
        ON master_seniority_tier_classification.code = master_issuer.seniority

      LEFT JOIN master_tax_free
        ON master_tax_free.code = master_issuer.tax_free

      LEFT JOIN master_secured_flag
        ON master_secured_flag.code = master_issuer.secured_flag

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
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        allotmentDate: formatDateSafe(item?.allotment_date) || '-',
        maturityDate: formatDateSafe(item?.maturity_date) || '-',
        couponRate: item?.coupon_rate || '-',
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
      endDate = '2026-03-31',

      ownershipType = "",
      sector = "",
      nature = "",
      securityType = "",
      creditRatingAgency = "",
      modeOfIssue = "",
      seniority = "",
      taxFree = "",
      listingStatus = "",
      securedFlag = "",
      rating = "",
      dealSize = "",

      // optional registrar filter
      registrar = ""
    } = req.body;

    /* ── VALIDATION ── */
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    if (start > end) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
    }

    /* ── BUILD DYNAMIC CONDITIONS ── */
    const conditions = [];
    const params = [];

    // Base date filter
    conditions.push(`mi.allotment_date BETWEEN ? AND ?`);
    params.push(startDate, endDate);

    // Rating
    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }

    // Deal Size
    if (dealSize) {
      conditions.push(`mi.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    // Ownership Type
    if (ownershipType) {
      conditions.push(`miot.description = ?`);
      params.push(ownershipType);
    }

    // Sector
    if (sector) {
      conditions.push(`mbs.description = ?`);
      params.push(sector);
    }

    // Nature
    if (nature) {
      conditions.push(`mint.description = ?`);
      params.push(nature);
    }

    // Security Type
    if (securityType) {
      conditions.push(`mst.description = ?`);
      params.push(securityType);
    }

    // Credit Rating Agency
    if (creditRatingAgency) {
      conditions.push(`rating_agency.short_name = ?`);
      params.push(creditRatingAgency);
    }

    // Mode Of Issue
    if (modeOfIssue) {
      conditions.push(`mmi.description = ?`);
      params.push(modeOfIssue);
    }

    // Seniority
    if (seniority) {
      conditions.push(`mstc.description = ?`);
      params.push(seniority);
    }

    // Tax Free
    if (taxFree) {
      conditions.push(`mtf.description = ?`);
      params.push(taxFree);
    }

    // Listing Status
    if (listingStatus) {
      conditions.push(`mls.description = ?`);
      params.push(listingStatus);
    }

    // Secured Flag
    if (securedFlag) {
      conditions.push(`msf.description = ?`);
      params.push(securedFlag);
    }

    // Registrar
    if (registrar) {
      conditions.push(`registrar_master.short_name = ?`);
      params.push(registrar);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    /* ── MAIN QUERY ── */
    const query = `
      SELECT
          am.month_no AS issue_month_no,

          MONTHNAME(
              STR_TO_DATE(am.month_no, '%m')
          ) AS issue_month,

          COUNT(
              DISTINCT CONCAT(
                  filtered_data.registrar_id,
                  '-',
                  filtered_data.isin
              )
          ) AS no_of_issue,

          IF(
              SUM(filtered_data.issue_size) > 0,
              ROUND(SUM(filtered_data.issue_size) / 10000000, 2),
              0
          ) AS issue_size,

          IFNULL(SUM(filtered_data.issue_size), 0) AS actual_issue_size

      FROM all_months am

      LEFT JOIN (

          /* ── UNIQUE FILTERED DATA ── */

          SELECT DISTINCT
              mi.id,
              mi.isin,
              ir.registrar_id,
              mi.issue_size,
              mi.allotment_date

          FROM master_issuer mi

          /* ── REGISTRAR RELATIONS ── */

          INNER JOIN issuer_registrar ir
              ON ir.issuer_id = mi.id

          INNER JOIN master_registrar registrar_master
              ON registrar_master.id = ir.registrar_id

          /* ── OWNERSHIP TYPE ── */

          LEFT JOIN master_issuer_ownership_type miot
              ON miot.code = mi.issuer_ownership_type

          /* ── BUSINESS SECTOR ── */

          LEFT JOIN master_business_sector mbs
              ON mbs.code = mi.business_sector

          /* ── NATURE ── */

          LEFT JOIN master_issuer_type_nature mint
              ON mint.code = mi.nature_type

          /* ── SECURITY TYPE ── */

          LEFT JOIN master_security_type mst
              ON mst.code = mi.security_class

          /* ── CREDIT RATING ── */

          LEFT JOIN master_issuer_rating mir
              ON mir.issuer_id = mi.id

          LEFT JOIN master_agency rating_agency
              ON rating_agency.id = mir.agency_id
              AND rating_agency.parent_id = 0

          /* ── MODE OF ISSUE ── */

          LEFT JOIN master_mode_issue mmi
              ON mmi.code = mi.mode_issue

          /* ── SENIORITY ── */

          LEFT JOIN master_seniority_tier_classification mstc
              ON mstc.code = mi.seniority

          /* ── TAX FREE ── */

          LEFT JOIN master_tax_free mtf
              ON mtf.code = mi.tax_free

          /* ── LISTING STATUS ── */

          LEFT JOIN master_issuer_stock_exchange mise
              ON mise.issuer_id = mi.id

          LEFT JOIN master_listing_status mls
              ON mls.code = mise.listing_status

          /* ── SECURED FLAG ── */

          LEFT JOIN master_secured_flag msf
              ON msf.code = mi.secured_flag

          ${whereClause}

      ) AS filtered_data

      ON am.month_no = MONTH(filtered_data.allotment_date)

      GROUP BY
          am.month_no,
          MONTHNAME(STR_TO_DATE(am.month_no, '%m'))

      ORDER BY
          am.month_no ASC
    `;

    const result = await prisma.$queryRawUnsafe(query, ...params);

    // Safe number extraction from BigInt
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const finalResult = result.map((item) => ({
      issueMonthNo: item?.issue_month_no || '-',
      issueMonth: item?.issue_month || '-',
      noOfIssue: safeNumber(item?.no_of_issue),
      issueSize: safeNumber(item?.issue_size),
      actualIssueSize: safeNumber(item?.actual_issue_size)
    }));

    res.status(200).json({
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

      registrarName = "",
      issuerName = "",
      rating = "",
      seniority = "",
      taxFree = "",
      securedFlag = "",
      trustee = "",
      creditRatingAgency = "",
      listingStatus = "",
      securityType = "",
      modeOfIssue = "",
      arranger = "",
      isin = ""
    } = req.body;

    // ── VALIDATION ──
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

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit value'
      });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid offset value'
      });
    }

    let parsedMonth = null;
    if (month !== "" && month !== null && month !== undefined) {
      parsedMonth = parseInt(month, 10);
      if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
        return res.status(400).json({
          success: false,
          error: 'month must be between 1 and 12'
        });
      }
    }

    // ── BUILD DYNAMIC CONDITIONS ──
    const conditions = [];
    const params = [];

    // Date Range
    conditions.push(`i.allotment_date BETWEEN ? AND ?`);
    params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);

    // Month Filter
    if (parsedMonth !== null) {
      conditions.push(`MONTH(i.allotment_date) = ?`);
      params.push(parsedMonth);
    }

    // ── DYNAMIC FILTERS ──
    if (registrarName) {
      conditions.push(`mr.short_name LIKE ?`);
      params.push(`%${registrarName}%`);
    }

    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (isin) {
      conditions.push(`i.isin LIKE ?`);
      params.push(`%${isin}%`);
    }

    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }

    if (seniority) {
      conditions.push(`mstc.description = ?`);
      params.push(seniority);
    }

    if (taxFree) {
      conditions.push(`tf.description = ?`);
      params.push(taxFree);
    }

    if (securedFlag) {
      conditions.push(`msf.description = ?`);
      params.push(securedFlag);
    }

    if (trustee) {
      conditions.push(`mt.short_name = ?`);
      params.push(trustee);
    }

    if (creditRatingAgency) {
      conditions.push(`mag.short_name = ?`);
      params.push(creditRatingAgency);
    }

    if (listingStatus) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM master_issuer_stock_exchange mise2
          LEFT JOIN master_listing_status mls2
            ON mls2.code = mise2.listing_status
          WHERE mise2.issuer_id = i.id
            AND mls2.description = ?
        )
      `);
      params.push(listingStatus);
    }

    if (securityType) {
      conditions.push(`s.description = ?`);
      params.push(securityType);
    }

    if (modeOfIssue) {
      conditions.push(`mi.description = ?`);
      params.push(modeOfIssue);
    }

    if (arranger) {
      conditions.push(`ma.short_name = ?`);
      params.push(arranger);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // ── SAFE DATE FORMATTER ──
    const formatDateSafe = (dateVal) => {
      if (!dateVal) return '-';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '-';
      return d.toISOString().split('T')[0];
    };

    // ── DATA QUERY ──
    const dataQuery = `
      SELECT
          i.id AS issuerId,

          ir1.registrar_id,

          MIN(mr.short_name) AS registrar_detail,

          i.isin,

          MIN(id.issuer_name) AS issuer_name,

          i.allotment_date,

          MIN(icd.coupon_rate) AS coupon_rate,

          MIN(mt.short_name) AS debenture_trustee_name,

          i.maturity_date,

          GROUP_CONCAT(DISTINCT mir.rating) AS rating,

          MIN(ma.short_name) AS arranger_name,

          MIN(i.security_name) AS security_name,

          MIN(s.description) AS security_type,

          MIN(mi.description) AS mode_issue,

          i.issue_size,

          i.face_value,

          GROUP_CONCAT(DISTINCT mag.short_name) AS agency_name,

          MIN(mstc.description) AS seniority,

          MIN(tf.description) AS tax_free,

          MIN(msf.description) AS secured_flag,

          (
              SELECT mls.description
              FROM master_issuer_stock_exchange AS mise
              LEFT JOIN master_listing_status AS mls
                  ON mls.code = mise.listing_status
              WHERE mise.issuer_id = i.id
              ORDER BY mise.listing_status
              LIMIT 1
          ) AS listing_status,

          i.issuer_master_id

      FROM master_issuer AS i

      LEFT JOIN issuer_details AS id
          ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
          ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
          ON i.mode_issue = mi.code

      LEFT JOIN issuer_coupon_details AS icd
          ON i.id = icd.issuer_id

      LEFT JOIN master_seniority_tier_classification AS mstc
          ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
          ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
          ON msf.code = i.secured_flag

      LEFT JOIN issuer_arranger AS ia
          ON i.id = ia.issuer_id

      LEFT JOIN master_arranger AS ma
          ON ia.arranger_id = ma.id

      LEFT JOIN issuer_trustee AS it
          ON i.id = it.issuer_id

      LEFT JOIN master_trustee AS mt
          ON it.trustee_id = mt.id

      LEFT JOIN master_issuer_rating AS mir
          ON i.id = mir.issuer_id

      LEFT JOIN master_agency AS mag
          ON mag.id = mir.agency_id

      INNER JOIN issuer_registrar AS ir1
          ON i.id = ir1.issuer_id

      INNER JOIN master_registrar AS mr
          ON ir1.registrar_id = mr.id

      ${whereClause}

      GROUP BY ir1.registrar_id, i.isin, i.id, i.allotment_date, i.maturity_date, i.issue_size, i.face_value, i.issuer_master_id

      ORDER BY id.issuer_name ASC

      LIMIT ? OFFSET ?
    `;

    // ── COUNT QUERY ──
    const countQuery = `
      SELECT COUNT(DISTINCT CONCAT(ir1.registrar_id, '-', i.isin)) AS total

      FROM master_issuer AS i

      LEFT JOIN issuer_details AS id
          ON i.issuer_master_id = id.id

      LEFT JOIN master_security_type AS s
          ON i.security_class = s.code

      LEFT JOIN master_mode_issue AS mi
          ON i.mode_issue = mi.code

      LEFT JOIN issuer_coupon_details AS icd
          ON i.id = icd.issuer_id

      LEFT JOIN master_seniority_tier_classification AS mstc
          ON mstc.code = i.seniority

      LEFT JOIN master_tax_free AS tf
          ON tf.code = i.tax_free

      LEFT JOIN master_secured_flag AS msf
          ON msf.code = i.secured_flag

      LEFT JOIN issuer_arranger AS ia
          ON i.id = ia.issuer_id

      LEFT JOIN master_arranger AS ma
          ON ia.arranger_id = ma.id

      LEFT JOIN issuer_trustee AS it
          ON i.id = it.issuer_id

      LEFT JOIN master_trustee AS mt
          ON it.trustee_id = mt.id

      LEFT JOIN master_issuer_rating AS mir
          ON i.id = mir.issuer_id

      LEFT JOIN master_agency AS mag
          ON mag.id = mir.agency_id

      INNER JOIN issuer_registrar AS ir1
          ON i.id = ir1.issuer_id

      INNER JOIN master_registrar AS mr
          ON ir1.registrar_id = mr.id

      ${whereClause}
    `;

    // ── EXECUTE QUERIES ──
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, parsedLimit, parsedOffset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    // ── TOTAL ──
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    const total = safeNumber(countResult?.[0]?.total);

    // ── FORMAT RESPONSE ──
    const finalResult = result?.map((item) => {
      return {
        issuerId: item?.issuerId || '-',
        registrarId: item?.registrar_id || '-',
        registrar: item?.registrar_detail || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || '-',
        allotmentDate: formatDateSafe(item?.allotment_date),
        maturityDate: formatDateSafe(item?.maturity_date),
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

    // ── RESPONSE ──
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
    } = req.body;

    // ── VALIDATION ──
    if (!startDate || !endDate || registrarId === undefined || registrarId === null) {
      return res.status(400).json({
        success: false,
        message: 'startDate, endDate and registrarId are required',
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format',
      });
    }
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before or equal to endDate',
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
        message: 'Invalid limit value',
      });
    }
    if (isNaN(parsedOffset) || parsedOffset < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid offset value',
      });
    }

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

    // ── SEARCH SETUP ──
    const searchTerm = SearchQuery?.trim();
    const hasSearch = !!searchTerm;

    const searchFields = [
      'issuer_name',
      'isin',
      'CAST(coupon_rate AS CHAR)',
      'debenture_trustee_name',
      'registrar_detail',
      'rating',
      'arranger_name',
      'security_name',
      'security_type',
      'mode_issue',
      'CAST(issue_size AS CHAR)',
      'CAST(face_value AS CHAR)',
      'agency_name',
      'seniority',
      'tax_free',
      'secured_flag',
      'listing_status',
    ];

    const searchConditions = hasSearch
      ? searchFields.map(() => '?').join(' LIKE ? OR ')
      : '';
    const searchSql = hasSearch
      ? `AND (${searchConditions} LIKE ?)`
      : '';
    const searchParams = hasSearch
      ? Array(searchFields.length).fill(`%${searchTerm}%`)
      : [];

    // ── BASE PARAMETERS ──
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;
    const baseParams = [parsedRegistrarId, startDateTime, endDateTime];

    // ── DATA QUERY ──
    const dataQuery = `
      SELECT *
      FROM (
          SELECT
              i.id AS issuerId,
              i.isin,
              MIN(id.issuer_name) AS issuer_name,
              MIN(i.allotment_date) AS allotment_date,
              MIN(icd.coupon_rate) AS coupon_rate,
              MIN(mt.short_name) AS debenture_trustee_name,
              MIN(mr.short_name) AS registrar_detail,
              MIN(i.maturity_date) AS maturity_date,
              GROUP_CONCAT(DISTINCT mir.rating) AS rating,
              MIN(ma.short_name) AS arranger_name,
              MIN(i.security_name) AS security_name,
              MIN(s.description) AS security_type,
              MIN(mi.description) AS mode_issue,
              MIN(i.issue_size) AS issue_size,
              MIN(i.face_value) AS face_value,
              GROUP_CONCAT(DISTINCT mag.short_name) AS agency_name,
              MIN(mstc.description) AS seniority,
              MIN(tf.description) AS tax_free,
              MIN(msf.description) AS secured_flag,
              MIN((
                  SELECT mls.description
                  FROM master_issuer_stock_exchange mise
                  LEFT JOIN master_listing_status mls
                      ON mls.code = mise.listing_status
                  WHERE mise.issuer_id = i.id
                  ORDER BY mise.listing_status
                  LIMIT 1
              )) AS listing_status,
              MIN(i.issuer_master_id) AS issuer_master_id

          FROM master_issuer i

          LEFT JOIN issuer_details id
              ON i.issuer_master_id = id.id

          LEFT JOIN master_security_type s
              ON i.security_class = s.code

          LEFT JOIN master_mode_issue mi
              ON i.mode_issue = mi.code

          LEFT JOIN issuer_coupon_details icd
              ON i.id = icd.issuer_id

          LEFT JOIN master_seniority_tier_classification mstc
              ON mstc.code = i.seniority

          LEFT JOIN master_tax_free tf
              ON tf.code = i.tax_free

          LEFT JOIN master_secured_flag msf
              ON msf.code = i.secured_flag

          LEFT JOIN issuer_arranger ia
              ON i.id = ia.issuer_id

          LEFT JOIN master_arranger ma
              ON ia.arranger_id = ma.id

          LEFT JOIN issuer_trustee it
              ON i.id = it.issuer_id

          LEFT JOIN master_trustee mt
              ON it.trustee_id = mt.id

          LEFT JOIN master_issuer_rating mir
              ON i.id = mir.issuer_id

          LEFT JOIN master_agency mag
              ON mag.id = mir.agency_id

          INNER JOIN issuer_registrar ir1
              ON i.id = ir1.issuer_id

          INNER JOIN master_registrar mr
              ON ir1.registrar_id = mr.id

          WHERE
              ir1.registrar_id = ?
              AND i.allotment_date BETWEEN ? AND ?

          GROUP BY
              ir1.registrar_id,
              i.isin,
              i.id
      ) x

      WHERE 1 = 1
      ${searchSql}

      ORDER BY ${orderBy} ${orderDirection}

      LIMIT ${parsedLimit}
      OFFSET ${parsedOffset}
    `;

    // ── COUNT QUERY ──
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
          SELECT i.id
          FROM master_issuer i

          LEFT JOIN issuer_details id
              ON i.issuer_master_id = id.id

          LEFT JOIN master_security_type s
              ON i.security_class = s.code

          LEFT JOIN master_mode_issue mi
              ON i.mode_issue = mi.code

          LEFT JOIN issuer_coupon_details icd
              ON i.id = icd.issuer_id

          LEFT JOIN master_seniority_tier_classification mstc
              ON mstc.code = i.seniority

          LEFT JOIN master_tax_free tf
              ON tf.code = i.tax_free

          LEFT JOIN master_secured_flag msf
              ON msf.code = i.secured_flag

          LEFT JOIN issuer_arranger ia
              ON i.id = ia.issuer_id

          LEFT JOIN master_arranger ma
              ON ia.arranger_id = ma.id

          LEFT JOIN issuer_trustee it
              ON i.id = it.issuer_id

          LEFT JOIN master_trustee mt
              ON it.trustee_id = mt.id

          LEFT JOIN master_issuer_rating mir
              ON i.id = mir.issuer_id

          LEFT JOIN master_agency mag
              ON mag.id = mir.agency_id

          INNER JOIN issuer_registrar ir1
              ON i.id = ir1.issuer_id

          INNER JOIN master_registrar mr
              ON ir1.registrar_id = mr.id

          WHERE
              ir1.registrar_id = ?
              AND i.allotment_date BETWEEN ? AND ?

          GROUP BY
              ir1.registrar_id,
              i.isin,
              i.id

          HAVING
              1 = 1
              ${hasSearch ? `
              AND (
                  MIN(id.issuer_name) LIKE ?
                  OR i.isin LIKE ?
                  OR MIN(CAST(icd.coupon_rate AS CHAR)) LIKE ?
                  OR MIN(mt.short_name) LIKE ?
                  OR MIN(mr.short_name) LIKE ?
                  OR GROUP_CONCAT(DISTINCT mir.rating) LIKE ?
                  OR MIN(ma.short_name) LIKE ?
                  OR MIN(i.security_name) LIKE ?
                  OR MIN(s.description) LIKE ?
                  OR MIN(mi.description) LIKE ?
                  OR MIN(CAST(i.issue_size AS CHAR)) LIKE ?
                  OR MIN(CAST(i.face_value AS CHAR)) LIKE ?
                  OR GROUP_CONCAT(DISTINCT mag.short_name) LIKE ?
                  OR MIN(mstc.description) LIKE ?
                  OR MIN(tf.description) LIKE ?
                  OR MIN(msf.description) LIKE ?
                  OR MIN((
                      SELECT mls.description
                      FROM master_issuer_stock_exchange mise
                      LEFT JOIN master_listing_status mls
                          ON mls.code = mise.listing_status
                      WHERE mise.issuer_id = i.id
                      ORDER BY mise.listing_status
                      LIMIT 1
                  )) LIKE ?
              )
              ` : ''}
      ) t
    `;

    // ── EXECUTE QUERIES ──
    const [data, totalCount] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...baseParams, ...searchParams),
      prisma.$queryRawUnsafe(
        countQuery,
        ...baseParams,
        ...(hasSearch ? searchParams : [])
      ),
    ]);

    // Safe number extraction from BigInt
    const safeNumber = (val) => {
      if (val === null || val === undefined) return 0;
      return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
    };

    return res.json({
      success: true,
      totalRecords: safeNumber(totalCount?.[0]?.total),
      data,
    });

  } catch (error) {
    console.error('registrar top_participants_details error:', error);

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