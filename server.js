const express = require('express');
const prisma = require('./db/mysqlDB');
require('dotenv').config();
const app = express();
const cors = require('cors');
const axios = require('axios');
app.use(express.json());
app.use(cors());

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

app.post('/dashboard_issue_size', async (req, res) => {
  try {
    const result = await prisma.master_issuer.groupBy(req.body);

    const finalResult = await Promise.all(result.map(async (item) => {
      const issuer = await prisma.issuer_details.findUnique({
        where: {
          id: item.issuer_master_id,
        },
        select: {
          issuer_name: true,
        },
      });

      const issuerSector = await prisma.master_business_sector.findUnique({
        where: {
          code: item.business_sector || 0,
        },
        select: {
          description: true,
        },
      });

      return {
        id: item.issuer_master_id,
        name: issuer?.issuer_name || 'undefined',
        noIssuer: item._count.isin || 0,
        issueSize: Math.round((item._sum.issue_size || 0) / 10000000),
        sector: issuerSector?.description || 'undefined'
      };
    }));
    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch master_issuer', message: error.message });
  }
});


app.post('/dashboard_monthly_issue_size', async (req, res) => {
  try {
    const { year } = req.body;
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        DATE_FORMAT(allotment_date, '%Y-%m') AS month,
        COUNT(*) AS no_of_issues,
        SUM(issue_size) AS issueSize
      FROM master_issuer
      WHERE 
        allotment_date IS NOT NULL
        AND YEAR(allotment_date) = ${year}
      GROUP BY month
      ORDER BY month ASC;
    `);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const formatted = result.map((row) => {
      const [_, monthNum] = row.month.split('-');
      const monthIndex = parseInt(monthNum, 10) - 1;
      return {
        name: monthNames[monthIndex],
        count: Number(row.no_of_issues),
        value: Number(row.issueSize ?? 0),
      };
    });
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching monthly issues:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/dashboard_sector_issue_size', async (req, res) => {
  try {
    const result = await prisma.master_issuer.groupBy(req.body);
    const finalResult = await Promise.all(result.map(async (item) => {
      const res = await prisma.master_business_sector.findUnique({
        where: {
          code: item.business_sector || 0
        },
        select: {
          description: true,
        },
      });
      return {
        id: item.business_sector || 0,
        name: res?.description || 'undefined',
        noIssuer: Number(item._count._all || 0),
        value: Number(item._sum.issue_size || 0),
      }
    }));

    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch master_issuer_sectors', message: error.message });
  }
});




app.post('/test_api', async (req, res) => {
  try {
    const result = req.body;


    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API', message: error.message });
  }
});



app.get('/issuersdetails', async (req, res) => {
  try {
    const issuerdetails = await prisma.issuer_details.findMany();
    res.json({ success: true, issuerdetails });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issuer_details', message: error.message });
  }
});

app.get('/', async (req, res) => {

  res.json({ success: true });
});







const getShortMonthName = (fullMonthName) => {
  return fullMonthName.slice(0, 3);
};

const getDate = (frequency, lessYear) => {
  if (frequency === 'Yearly') {
    return `${Number(lessYear) + 1}-03-31`;
  }
  if (frequency === 'Half-Yearly') {
    return `${Number(lessYear)}-09-30`;
  }
  if (frequency === 'Quarterly') {
    return `${Number(lessYear)}-07-31`;
  }
  else {
    return '';
  }
}

const getFilteredMonths = (frequencyType, monthRanges) => {
  switch (frequencyType) {
    case 'Quarterly':
      return monthRanges.slice(0, 4); // April, May, June
    case 'Half-Yearly':
      return monthRanges.slice(0, 6); // April to September
    case 'Yearly':
    default:
      return monthRanges; // all months
  }
};

const getPreviousYear = (dateStr) => {
  const date = new Date(dateStr);
  date.setFullYear(date.getFullYear() - 1);

  const lessYearDate = date.toISOString().split('T')[0];
  return lessYearDate;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months start at 0
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}



//updated Dashoard APIs
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      GROUP BY master_issuer.business_sector
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      GROUP BY master_issuer.business_sector
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      GROUP BY master_issuer.business_sector
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      GROUP BY master_issuer.business_sector
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
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      GROUP BY master_issuer.business_sector
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

    // Basic validation
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Step 1: Fetch the dynamic total count of ratings first
    const totalRatingsQuery = `SELECT count(*) as aggregate FROM master_issuer_rating`;
    const totalRatingsResult = await prisma.$queryRawUnsafe(totalRatingsQuery);
    // Use the dynamic count, with a fallback of 1 to prevent division by zero
    const totalRatings = totalRatingsResult[0]?.aggregate || 1;

    // Step 2: Define all five SQL queries using the dynamic total and date range
    const issuersQuery = `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.rating) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY master_issuer_rating.agency_id
    `;

    const arrangersQuery = `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.rating) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger ON issuer_arranger.issuer_id = i.id
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY master_issuer_rating.agency_id
    `;

    const trusteeQuery = `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.rating) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_trustee ON issuer_trustee.issuer_id = i.id
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY master_issuer_rating.agency_id
    `;

    const registrarQuery = `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.rating) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_registrar ON issuer_registrar.issuer_id = i.id
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY master_issuer_rating.agency_id
    `;

    // The fifth query was identical to the first, so we'll run it as provided.
    const agencyQuery = `
      SELECT
        master_agency.short_name as label,
        ROUND((COUNT(master_issuer_rating.rating) / ${totalRatings} * 100), 2) as percentage,
        COUNT(master_issuer_rating.id) as rating_no,
        concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
        master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer as i ON i.id = master_issuer_rating.issuer_id
      WHERE i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY master_issuer_rating.agency_id
    `;

    // Step 3: Create an array of promises and execute them concurrently
    const queries = [
      prisma.$queryRawUnsafe(issuersQuery),
      prisma.$queryRawUnsafe(arrangersQuery),
      prisma.$queryRawUnsafe(trusteeQuery),
      prisma.$queryRawUnsafe(registrarQuery),
      prisma.$queryRawUnsafe(agencyQuery),
    ];

    const [
      issuers,
      arrangers,
      trustees,
      registrars,
      ratingAgencies
    ] = await Promise.all(queries);

    // Step 4: Construct the final response object
    const result = {
      issuers,
      arrangers,
      trustees,
      registrars,
      ratingAgencies
    };

    // Step 5: Send the successful response
    res.status(200).json(result);

  } catch (error) {
    console.error('Error fetching dashboard agency rating share data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard agency rating share data', message: error.message });
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
      WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
      GROUP BY allotment_month, a.month_name
      ORDER BY a.id ASC
    `;

    const previousYearQuery = `
      SELECT
        MONTH(master_issuer.allotment_date) as allotment_month,
        a.month_name as month_name,
        ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
        COUNT(master_issuer.isin) AS issue_count
      FROM master_issuer
      JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
      WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
      GROUP BY allotment_month, a.month_name
      ORDER BY a.id ASC
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
        WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}') as largest_issue_size,
        
        COALESCE((ROUND(SUM(issue_size)/10000000)), 0) as total_issue_size_in_cr,
        
        COALESCE((ROUND(AVG(issue_size)/10000000)), 0) as avg_issue_size_in_cr,
        
        COUNT(*) as total_issues,
        
        (SELECT b.description 
        FROM master_issuer mi
        INNER JOIN master_business_sector b ON b.code = mi.business_sector
        WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
          AND mi.business_sector IS NOT NULL
        GROUP BY mi.business_sector
        ORDER BY SUM(mi.issue_size) DESC
        LIMIT 1) as top_sector_by_volume
    FROM master_issuer
    WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}';
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
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY a.id ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY a.id ASC
        `;
        sectorsQuery = `
              SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      and issuer_master_id = ${id}
      GROUP BY master_issuer.business_sector
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
      and i.allotment_date between '${startDate}' AND '${endDate}'
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
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND ia.arranger_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND ia.arranger_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;
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
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND it.trustee_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND it.trustee_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
  AND mi.business_sector IS NOT NULL
  AND it.trustee_id = ${id}
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
INNER JOIN issuer_trustee 
    ON issuer_trustee.issuer_id = i.id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND ir.registrar_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND ir.registrar_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
  AND mi.business_sector IS NOT NULL
  AND ir.registrar_id = ${id}
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
INNER JOIN issuer_registrar 
    ON issuer_registrar.issuer_id = i.id
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND mir.agency_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND mir.agency_id = ${id}
GROUP BY allotment_month, a.month_name
ORDER BY a.id ASC;

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
WHERE mi.allotment_date BETWEEN '${startDate}' AND '${endDate}'
  AND mi.business_sector IS NOT NULL
  AND mir.agency_id = ${id}
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
WHERE 
    i.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY a.id ASC
        `;
        previousYearQuery = `
          SELECT
    MONTH(master_issuer.allotment_date) as allotment_month,
    a.month_name as month_name,
    ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS total_issue_size,
    COUNT(master_issuer.isin) AS issue_count
  FROM master_issuer
  JOIN all_months as a ON a.month_no = MONTH(master_issuer.allotment_date)
  WHERE master_issuer.allotment_date BETWEEN '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
  AND issuer_master_id = ${id}
  GROUP BY allotment_month, a.month_name
  ORDER BY a.id ASC
        `;
        sectorsQuery = `
              SELECT
        b.description as business_name,
        COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
        COUNT(isin) AS no_of_issue,
        concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color
      FROM master_issuer
      INNER JOIN master_business_sector as b on b.code = master_issuer.business_sector
      WHERE allotment_date BETWEEN '${startDate}' AND '${endDate}' AND business_sector IS NOT NULL
      and issuer_master_id = ${id}
      GROUP BY master_issuer.business_sector
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
      and i.allotment_date between '${startDate}' AND '${endDate}'
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


//updated issuer APIs
app.post('/issuers_page_top_issuers_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
      `)

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer where allotment_date between '${formatDate(currentStartDate)}' and '${formatDate(currentEndDate)}'
        `);
    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer where allotment_date between '${formatDate(previousStartDate)}' and '${formatDate(previousEndDate)}'
        `);

    let tableQuery = '';

    if (issueType && issueType == 'count') {

      tableQuery = `
      SELECT
table1.id AS id,
table1.issuer_name AS issuer_name,
table1.no_issues AS cy_issues,
table1.issue_size AS cy_issue_size,
table1.arr_rank AS cy_arr_rank,
table2.no_issues AS py_issues,
table2.issue_size AS py_issue_size,
table2.arr_rank AS py_arr_rank,
ROUND( (table1.no_issues / ${totalIssuesCountCurrYear[0]?.aggregate || 1}) * 100 ,2) as cy_mkt_share,
ROUND( (table2.no_issues / ${totalIssuesCountPrevYear[0]?.aggregate || 1}) * 100 ,2) as py_mkt_share,
(
case
when (IFNULL(table1.no_issues,0)+IFNULL(table2.no_issues,0)) = 0 then 0
else
ROUND( ((IFNULL(table1.no_issues,0)-IFNULL(table2.no_issues,0)) / (IFNULL(table1.no_issues,0)+IFNULL(table2.no_issues,0))) * 100 ,2)
end
) as yoy
FROM
(select
issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
RANK() OVER ( ORDER BY count(isin) DESC , ROUND(SUM(issue_size) / 10000000,2) DESC ) as arr_rank
from master_issuer
join issuer_details on issuer_details.id=master_issuer.issuer_master_id
where allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
group by issuer_details.id
order by arr_rank
limit 10
) as table1
left JOIN
(select
issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
RANK() OVER ( ORDER BY count(isin) DESC , ROUND(SUM(issue_size) / 10000000,2) DESC ) as arr_rank
from master_issuer
join issuer_details on issuer_details.id=master_issuer.issuer_master_id
where allotment_date between '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
group by issuer_details.id) as table2
on table1.id=table2.id
order by table1.arr_rank asc;
      `;

    } else {
      tableQuery = `
      SELECT
table1.id AS id,
table1.issuer_name AS issuer_name,
table1.no_issues AS cy_issues,
table1.issue_size AS cy_issue_size,
table1.arr_rank AS cy_arr_rank,
table2.no_issues AS py_issues,
table2.issue_size AS py_issue_size,
table2.arr_rank AS py_arr_rank,
ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
(
case
when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
else
ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
end
) as yoy
FROM
(select
issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
from master_issuer
join issuer_details on issuer_details.id=master_issuer.issuer_master_id
where allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
group by issuer_details.id
order by arr_rank
limit 10
) as table1
left JOIN
(select
issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
from master_issuer
join issuer_details on issuer_details.id=master_issuer.issuer_master_id
where allotment_date between '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
group by issuer_details.id) as table2
on table1.id=table2.id
order by table1.arr_rank asc;
      `;
    }


    const result = await prisma.$queryRawUnsafe(tableQuery);

    const finalResult = result?.map((item) => {
      return {
        id: item?.id || '-',
        rank: item?.cy_arr_rank || '-',
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || '-',
        currentDeals: item?.cy_issues || '-',
        currentMarketShare: item?.cy_mkt_share || '-',
        previousRank: item?.py_arr_rank || '-',
        previousSize: item?.py_issue_size || '-',
        previousDeals: item?.py_issues || '-',
        previousMarketShare: item?.py_mkt_share || '-',
        yoyChange: item?.yoy || '-'
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.post('/issuers_page_top_sectors_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
    let sectorsQuery = '';

    if (issueType && issueType == 'count') {
      sectorsQuery = `
    SELECT
table1.business_sector AS id,
table1.sector_name AS sector_name,
table1.issue_no AS cy_issue_no,
table2.issue_no AS py_issue_no
FROM
(select
master_issuer.business_sector,master_business_sector.description as sector_name,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
count(isin) as issue_no
from master_issuer
join master_business_sector on master_issuer.business_sector=master_business_sector.code
where allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
group by master_issuer.business_sector
order by issue_no desc
limit 10
) as table1
JOIN
(
select
master_issuer.business_sector,master_business_sector.description as sector_name,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
count(isin) as issue_no
from master_issuer
join master_business_sector on master_issuer.business_sector=master_business_sector.code
where allotment_date between '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
group by master_issuer.business_sector
order by issue_no
) as table2
on table1.business_sector=table2.business_sector
order by cy_issue_no desc
    `;
    } else {
      sectorsQuery = `
    SELECT
table1.business_sector AS id,
table1.sector_name AS sector_name,
table1.issue_size AS cy_issue_size,
table2.issue_size AS py_issue_size
FROM
(select
master_issuer.business_sector,master_business_sector.description as sector_name,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
count(isin) as issue_no
from master_issuer
join master_business_sector on master_issuer.business_sector=master_business_sector.code
where allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
group by master_issuer.business_sector
order by issue_size desc
limit 10
) as table1
JOIN
(
select
master_issuer.business_sector,master_business_sector.description as sector_name,
ROUND(SUM(issue_size) / 10000000,2) as issue_size,
count(isin) as issue_no
from master_issuer
join master_business_sector on master_issuer.business_sector=master_business_sector.code
where allotment_date between '${formatDate(previousStartDate)}' AND '${formatDate(previousEndDate)}'
group by master_issuer.business_sector
order by issue_size
) as table2
on table1.business_sector=table2.business_sector
order by cy_issue_size desc
    `;
    }

    const result = await prisma.$queryRawUnsafe(sectorsQuery);

    const finalResult = result?.map((item) => {
      return {
        name: item?.sector_name || '-',
        value: issueType == 'count' ? parseFloat(item?.cy_issue_no) : parseFloat(item?.cy_issue_size) || null,
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issuers top sectors data', message: error.message });
  }
});

app.post('/issuers_page_outstanding_data', async (req, res) => {
  try {

    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }
    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const issueData = await prisma.$queryRawUnsafe(`
          SELECT
            MONTH(allotment_date) AS month,
            MONTHNAME(allotment_date) AS label,
            ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
            COUNT(isin) AS isin_count
          FROM master_issuer
          WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
          GROUP BY month
          ORDER BY month ASC
      `);

    const redemptionData = await prisma.$queryRawUnsafe(`
        SELECT
          MONTH(maturity_date) AS month,
          MONTHNAME(maturity_date) AS label,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          COUNT(isin) AS isin_count
        FROM master_issuer
        WHERE maturity_date BETWEEN '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
        GROUP BY month
        ORDER BY month ASC
      `);

    function getMonthlyRanges(startDateStr, endDateStr) {
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);

      // Ensure we start on the 1st of the starting month
      let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

      const result = [];
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];

      while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth();

        // Start of the month
        const monthStart = new Date(year, month, 1);

        // End of the month (0th day of next month gives last day of current month)
        const monthEnd = new Date(year, month + 1, 0);

        // Clip the final end date if the overall endDate is earlier
        const effectiveEnd =
          monthEnd > endDate ? endDate : monthEnd;

        result.push({
          label: monthNames[month],
          start: monthStart.toISOString().slice(0, 10),
          end: effectiveEnd.toISOString().slice(0, 10),
        });

        // Move to next month
        current = new Date(year, month + 1, 1);
      }

      return result;
    }

    const allMonthRanges = getMonthlyRanges(startDate, endDate);

    const outstandingPromises = allMonthRanges?.map(async ({ label, start, end }) => {
      const [result] = await prisma.$queryRawUnsafe(`
          SELECT ROUND(SUM(issue_size) / 10000000, 2) AS aggregate
          FROM master_issuer
          WHERE allotment_date < '${start}'
            AND maturity_date > '${end}'
            AND security_status = 1
        `);
      return {
        label,
        outstanding: result?.aggregate || 0
      };
    });

    const outstandingData = await Promise.all(outstandingPromises);


    const formattedData = allMonthRanges?.map(({ label }) => {
      const issue = issueData?.find(item => item?.label === label);
      const redemption = redemptionData?.find(item => item?.label === label);
      const outstanding = outstandingData?.find(item => item?.label === label);

      return {
        month: getShortMonthName(label) || label,
        issue: issue?.issue_size || 0,
        redemption: redemption?.issue_size || 0,
        outstanding: outstanding?.outstanding || 0
      };
    })


    // Response
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.get('/issuers_page_current_year_debt_redemption_data', async (req, res) => {
  try {

    const now = new Date();

    const nextYear = getUpcomingMarch31(now);

    const redemptionData = await prisma.$queryRawUnsafe(`
        SELECT
          MONTH(maturity_date) AS month,
          MONTHNAME(maturity_date) AS label,
          YEAR(maturity_date) AS year,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          COUNT(isin) AS isin_count
        FROM master_issuer
        WHERE maturity_date BETWEEN '${formatDate(now)}' AND '${formatDate(nextYear)}'
        GROUP BY month
        ORDER BY year,month ASC
      `);

    res.json(redemptionData);
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
})

app.get('/issuers_page_next_year_redemption_data', async (req, res) => {
  try {

    function getNextFinancialYearRange(referenceDate = new Date()) {
      const year = referenceDate.getFullYear();
      const month = referenceDate.getMonth(); // 0 = Jan, 3 = April

      // If we're already in or after April, next FY starts April of next year
      const startYear = month >= 3 ? year + 1 : year;
      const endYear = startYear + 1;

      const start = new Date(startYear, 3, 1);      // April 1
      const end = new Date(endYear, 2, 31);       // March 31

      return {
        start: formatDate(start),
        end: formatDate(end)
      };
    }

    const { start, end } = getNextFinancialYearRange();

    const redemptionData = await prisma.$queryRawUnsafe(`
        SELECT
          MONTH(maturity_date) AS month,
          MONTHNAME(maturity_date) AS label,
          YEAR(maturity_date) AS year,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          COUNT(isin) AS isin_count
        FROM master_issuer
        WHERE maturity_date BETWEEN '${start}' AND '${end}'
        GROUP BY month
        ORDER BY year,month ASC
      `);

    res.json(redemptionData);
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
})

app.post('/issuers_page_agency_rating_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }
    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

    const totalRatingNo = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;
      `)
    const result = await prisma.$queryRawUnsafe(`
      select 
      master_agency.short_name as label, 
      ROUND((COUNT(master_issuer_rating.rating)/(${totalRatingNo[0]?.aggregate || 1}) * 100) ,2) as percentage, 
      COUNT(master_issuer_rating.id) as rating_no ,
      concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
      master_issuer_rating.rating from master_agency 
      inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where i.allotment_date between '${formatDate(currentStartDate)}' AND '${formatDate(currentEndDate)}'
      group by master_issuer_rating.agency_id
    `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});

app.post('/issuers_page_detailed_data', async (req, res) => {
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
    listingStatus = ""
  } = req.body;

  try {
    // Build WHERE conditions dynamically
    const conditions = [];
    const params = [];

    // Add base condition for date range
    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ?`);
    params.push(startDate, endDate);

    // Add other conditions
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

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query for data with pagination
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
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          mls.description AS listing_status, 
          mise.listing_status AS listing_status_code
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls 
          ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id, mls.description, mise.listing_status
      ) AS listing_data
      ON listing_data.issuer_id = master_issuer.id
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
        ON issuer_coupon_details.issuer_id = issuer_details.id
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
      ${whereClause}
      ORDER BY master_issuer.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM master_issuer
      ${whereClause}
    `;



    // Execute both queries in parallel
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, limit, offset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = countResult[0]?.total || 0;

    const finalResult = result?.map((item) => {
      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
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
      }
    });

    // Return data with pagination info
    res.status(200).json({
      data: finalResult,
      pagination: {
        total: parseInt(total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(total)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch detailed issuepage data', message: error.message });
  }
});

app.post('/specific_month_redemption_data', async (req, res) => {
  const {
    startDate = '2026-03-01',
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
    listingStatus = ""
  } = req.body;

  try {
    const conditions = [];
    const params = [];

    /** Base date filter (Maturity Date) */
    conditions.push(`i.maturity_date BETWEEN ? AND ?`);
    params.push(startDate, endDate);

    /** Dynamic filters */
    if (issuerName) {
      conditions.push(`id.issuer_name LIKE ?`);
      params.push(`%${issuerName}%`);
    }

    if (rating) {
      conditions.push(`mir.rating = ?`);
      params.push(rating);
    }

    if (registrar) {
      conditions.push(`mr.short_name = ?`);
      params.push(registrar);
    }

    if (arranger) {
      conditions.push(`ma.short_name = ?`);
      params.push(arranger);
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

    if (dealSize) {
      conditions.push(`i.issue_size LIKE ?`);
      params.push(`%${dealSize}%`);
    }

    if (listingStatus) {
      conditions.push(`
        (
          SELECT mise.listing_status
          FROM master_issuer_stock_exchange mise
          WHERE mise.issuer_id = i.id
          ORDER BY mise.listing_status
          LIMIT 1
        ) = ?
      `);
      params.push(listingStatus);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    /* =========================
       DATA QUERY
    ========================= */
    const dataQuery = `
      SELECT
        i.id AS issuerId,
        i.isin,
        id.issuer_name,
        i.allotment_date,
        icd.coupon_rate,
        mt.short_name AS debenture_trustee_name,
        mr.short_name AS registrar_detail,
        i.maturity_date,
        GROUP_CONCAT(DISTINCT mir.rating) AS rating,
        ma.short_name AS arranger_name,
        i.security_name,
        s.description AS security_type,
        mi.description AS mode_issue,
        i.issue_size,
        i.face_value,
        GROUP_CONCAT(DISTINCT mag.short_name) AS agency_name,
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
      FROM all_months
      INNER JOIN master_issuer i
        ON all_months.month_no = MONTH(i.allotment_date)
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
      LEFT JOIN issuer_registrar ir
        ON i.id = ir.issuer_id
      LEFT JOIN master_registrar mr
        ON ir.registrar_id = mr.id
      LEFT JOIN master_issuer_rating mir
        ON i.id = mir.issuer_id
      LEFT JOIN master_agency mag
        ON mag.id = mir.agency_id
      ${whereClause}
      GROUP BY i.isin
      ORDER BY id.issuer_name ASC
      LIMIT ? OFFSET ?
    `;

    /* =========================
       COUNT QUERY
    ========================= */
    const countQuery = `
      SELECT COUNT(*) AS total FROM (
        SELECT i.isin
        FROM all_months
        INNER JOIN master_issuer i
          ON all_months.month_no = MONTH(i.allotment_date)
        LEFT JOIN issuer_details id
          ON i.issuer_master_id = id.id
        LEFT JOIN master_issuer_rating mir
          ON i.id = mir.issuer_id
        LEFT JOIN master_agency mag
          ON mag.id = mir.agency_id
        LEFT JOIN issuer_registrar ir
          ON i.id = ir.issuer_id
        LEFT JOIN master_registrar mr
          ON ir.registrar_id = mr.id
        LEFT JOIN issuer_arranger ia
          ON i.id = ia.issuer_id
        LEFT JOIN master_arranger ma
          ON ia.arranger_id = ma.id
        LEFT JOIN issuer_trustee it
          ON i.id = it.issuer_id
        LEFT JOIN master_trustee mt
          ON it.trustee_id = mt.id
        LEFT JOIN master_seniority_tier_classification mstc
          ON mstc.code = i.seniority
        LEFT JOIN master_tax_free tf
          ON tf.code = i.tax_free
        LEFT JOIN master_secured_flag msf
          ON msf.code = i.secured_flag
        ${whereClause}
        GROUP BY i.isin
      ) AS aggregate_table
    `;

    const [rows, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, limit, offset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = countResult?.[0]?.total || 0;

    res.status(200).json({
      data: rows,
      pagination: {
        total: Number(total),
        limit: Number(limit),
        offset: Number(offset),
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch redemption data',
      message: error.message
    });
  }
});


//updated arranger APIs

app.post('/arrangers_page_top_arrangers_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalIssueSize = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

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
        ROUND((t1.no_issues / ${totalIssuesCountCurrYear[0]?.aggregate || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${totalIssuesCountPrevYear[0]?.aggregate || 1}) * 100, 2) AS py_mkt_share,
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
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_arranger ia ON ia.issuer_id = mi.id
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY ia.arranger_id
        ORDER BY arr_rank
        LIMIT 10
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_arranger ia ON ia.issuer_id = mi.id
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY ia.arranger_id
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
        ROUND((t1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100, 2) AS py_mkt_share,
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
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_arranger ia ON ia.issuer_id = mi.id
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY ia.arranger_id
        ORDER BY arr_rank
        LIMIT 10
      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_arranger ia ON ia.issuer_id = mi.id
        JOIN master_arranger ma ON ma.id = ia.arranger_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY ia.arranger_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery);

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    /**
     * Ranked arrangers — SAME LOGIC as tableQuery
     */
    const rankedArrangersSubQuery =
      issueType === 'count'
        ? `
      SELECT
        ma.id AS arranger_id,
        ma.short_name AS arranger_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_arranger ia ON ia.issuer_id = mi.id
      JOIN master_arranger ma ON ma.id = ia.arranger_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY ia.arranger_id
      ORDER BY arr_rank
      LIMIT 10
    `
        : `
      SELECT
        ma.id AS arranger_id,
        ma.short_name AS arranger_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_arranger ia ON ia.issuer_id = mi.id
      JOIN master_arranger ma ON ma.id = ia.arranger_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY ia.arranger_id
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
  JOIN issuer_arranger ia
    ON ia.arranger_id = r.arranger_id
  JOIN master_issuer mi
    ON mi.id = ia.issuer_id
  JOIN master_business_sector mbs
    ON mi.business_sector = mbs.code
  WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
  GROUP BY
    r.arranger_id,
    r.arranger_name,
    r.arr_rank,
    mi.business_sector
  ORDER BY
    r.arr_rank,
    value DESC;
`;

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery);


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
      sectorData
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
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating
    `);



    /* ---------------- MAIN TABLE QUERY ---------------- */

    const creditRatingQuery = `
    SELECT
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatingNo[0]?.aggregate || 1}) * 100,
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
    master_issuer_rating.rating
FROM master_agency
INNER JOIN master_issuer_rating
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN master_issuer AS i
    ON i.id = master_issuer_rating.issuer_id
INNER JOIN issuer_arranger
    ON issuer_arranger.issuer_id = i.id
WHERE i.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
GROUP BY master_issuer_rating.rating;
`;



    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })

    res.status(200).json({
      ratingData: finalResult,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch arrangers credit rating data',
      message: error.message
    });
  }
});

//updated trustee APIs

app.post('/trustees_page_top_trustees_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalIssueSize = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

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
        ROUND((t1.no_issues / ${totalIssuesCountCurrYear[0]?.aggregate || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${totalIssuesCountPrevYear[0]?.aggregate || 1}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN (IFNULL(t1.no_issues,0) + IFNULL(t2.no_issues,0)) = 0 THEN 0
          ELSE ROUND(
            ((IFNULL(t1.no_issues,0) - IFNULL(t2.no_issues,0)) /
            (IFNULL(t1.no_issues,0) + IFNULL(t2.no_issues,0))) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mt.id,
          mt.short_name AS issuer_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY it.trustee_id
        ORDER BY arr_rank
        LIMIT 10
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY it.trustee_id
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
        ROUND((t1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100, 2) AS py_mkt_share,
        CASE
          WHEN (IFNULL(t1.issue_size,0) + IFNULL(t2.issue_size,0)) = 0 THEN 0
          ELSE ROUND(
            ((IFNULL(t1.issue_size,0) - IFNULL(t2.issue_size,0)) /
            (IFNULL(t1.issue_size,0) + IFNULL(t2.issue_size,0))) * 100, 2
          )
        END AS yoy
      FROM (
        SELECT
          mt.id,
          mt.short_name AS issuer_name,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY it.trustee_id
        ORDER BY arr_rank
        LIMIT 10
      ) t1
      LEFT JOIN (
        SELECT
          mt.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_trustee it ON it.issuer_id = mi.id
        JOIN master_trustee mt ON mt.id = it.trustee_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY it.trustee_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery);

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    /**
     * Ranked trustees — SAME LOGIC as tableQuery
     */
    const rankedTrusteesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_trustee it ON it.issuer_id = mi.id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY it.trustee_id
      ORDER BY arr_rank
      LIMIT 10
    `
        : `
      SELECT
        mt.id AS trustee_id,
        mt.short_name AS trustee_name,
        RANK() OVER (
          ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_trustee it ON it.issuer_id = mi.id
      JOIN master_trustee mt ON mt.id = it.trustee_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY it.trustee_id
      ORDER BY arr_rank
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
  JOIN issuer_trustee it
    ON it.trustee_id = r.trustee_id
  JOIN master_issuer mi
    ON mi.id = it.issuer_id
  JOIN master_business_sector mbs
    ON mi.business_sector = mbs.code
  WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
  GROUP BY
    r.trustee_id,
    r.trustee_name,
    r.arr_rank,
    mi.business_sector
  ORDER BY
    r.arr_rank,
    value DESC;
`;

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery);

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
      sectorData
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch trustees data',
      message: error.message
    });
  }
});

app.post('/trustees_page_credit_rating_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const creditRatingQuery = `
    SELECT
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatingNo[0]?.aggregate || 1}) * 100,
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
    master_issuer_rating.rating
FROM master_agency
INNER JOIN master_issuer_rating
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN master_issuer AS i
    ON i.id = master_issuer_rating.issuer_id
INNER JOIN issuer_trustee
    ON issuer_trustee.issuer_id = i.id
WHERE i.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
GROUP BY master_issuer_rating.rating;
`;

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })

    res.status(200).json({
      ratingData: finalResult,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch trustees credit rating data',
      message: error.message
    });
  }
});
//updated rating agency APIs

app.post('/rating_agencies_page_top_agencies_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType, limit = 10, offset = 0 } = req.body;


    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalIssueSize = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

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
        ROUND((t1.no_issues / ${totalIssuesCountCurrYear[0]?.aggregate || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${totalIssuesCountPrevYear[0]?.aggregate || 1}) * 100, 2) AS py_mkt_share,
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
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY mir.agency_id
        ORDER BY arr_rank
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}

      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY mir.agency_id
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
        ROUND((t1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100, 2) AS py_mkt_share,
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
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY mir.agency_id
        ORDER BY arr_rank
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}

      ) t1
      LEFT JOIN (
        SELECT
          ma.id,
          COUNT(mi.isin) AS no_issues,
          ROUND(SUM(mi.issue_size) / 10000000, 2) AS issue_size,
          RANK() OVER (
            ORDER BY SUM(mi.issue_size) DESC, COUNT(mi.isin) DESC
          ) AS arr_rank
        FROM master_issuer mi
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
        JOIN master_agency ma ON ma.id = mir.agency_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY mir.agency_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery);


    /* ---------------- TOTAL COUNT ---------------- */

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT mir.agency_id) AS total
      FROM master_issuer mi
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
    `);

    const totalRecords = totalCountResult[0]?.total || 0;

    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    /**
     * Ranked agencies — SAME LOGIC as tableQuery
     */
    const rankedAgenciesSubQuery =
      issueType === 'count'
        ? `
      SELECT
        ma.id AS agency_id,
        ma.short_name AS agency_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_details idet ON idet.id = mi.issuer_master_id
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY mir.agency_id
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
      FROM master_issuer mi
      JOIN issuer_details idet ON idet.id = mi.issuer_master_id
      JOIN master_issuer_rating mir ON mir.issuer_id = mi.id
      JOIN master_agency ma ON ma.id = mir.agency_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY mir.agency_id
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
  JOIN master_issuer_rating mir
    ON mir.agency_id = r.agency_id
  JOIN master_issuer mi
    ON mi.id = mir.issuer_id
  JOIN master_business_sector mbs
    ON mi.business_sector = mbs.code
  WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
  GROUP BY
    r.agency_id,
    r.agency_name,
    r.arr_rank,
    mi.business_sector
  ORDER BY
    r.arr_rank,
    value DESC;
`;

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery);

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
        limit,
        offset
      }

    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch rating agencies data',
      message: error.message
    });
  }
});

app.post('/rating_agencies_page_credit_rating_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

    const creditRatingQuery = `
    SELECT
    master_agency.short_name AS label,
    ROUND(
        (COUNT(master_issuer_rating.rating) / ${totalRatingNo[0]?.aggregate || 1}) * 100,
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
    master_issuer_rating.rating
FROM master_agency
INNER JOIN master_issuer_rating
    ON master_issuer_rating.agency_id = master_agency.id
LEFT JOIN master_issuer AS i
    ON i.id = master_issuer_rating.issuer_id
WHERE i.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
GROUP BY master_issuer_rating.rating;
`;

    const creditRatingResult = await prisma.$queryRawUnsafe(creditRatingQuery);

    const finalResult = creditRatingResult?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })

    res.status(200).json({
      ratingData: finalResult,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch rating agencies credit rating data',
      message: error.message
    });
  }
});

//updated registrar APIs

app.post('/registrars_page_top_registrars_data', async (req, res) => {
  try {
    const { startDate, endDate, issueType, limit = 10, offset = 0 } = req.body;


    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate, endDate are required' });
    }

    const currentStartDate = new Date(startDate);
    const currentEndDate = new Date(endDate);

    const previousStartDate = new Date(currentStartDate);
    previousStartDate.setFullYear(previousStartDate.getFullYear() - 1);

    const previousEndDate = new Date(currentEndDate);
    previousEndDate.setFullYear(previousEndDate.getFullYear() - 1);

    const formatDate = (date) =>
      date.toISOString().slice(0, 19).replace('T', ' ');

    /* ---------------- TOTALS ---------------- */

    const totalIssueSize = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
      SELECT SUM(issue_size) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    const totalIssuesCountCurrYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
    `);

    const totalIssuesCountPrevYear = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM master_issuer
      WHERE allotment_date BETWEEN '${formatDate(previousStartDate)}'
                              AND '${formatDate(previousEndDate)}'
    `);

    /* ---------------- MAIN TABLE QUERY ---------------- */

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
        ROUND((t1.no_issues / ${totalIssuesCountCurrYear[0]?.aggregate || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.no_issues / ${totalIssuesCountPrevYear[0]?.aggregate || 1}) * 100, 2) AS py_mkt_share,
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
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}

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
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
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
        ROUND((t1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100, 2) AS cy_mkt_share,
        ROUND((t2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100, 2) AS py_mkt_share,
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
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                    AND '${formatDate(currentEndDate)}'
        GROUP BY ir.registrar_id
        ORDER BY arr_rank
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}

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
        JOIN issuer_details idet ON idet.id = mi.issuer_master_id
        JOIN issuer_registrar ir ON ir.issuer_id = mi.id
        JOIN master_registrar mr ON mr.id = ir.registrar_id
        WHERE mi.allotment_date BETWEEN '${formatDate(previousStartDate)}'
                                    AND '${formatDate(previousEndDate)}'
        GROUP BY ir.registrar_id
      ) t2 ON t1.id = t2.id
      ORDER BY t1.arr_rank;
      `;
    }

    const tableResult = await prisma.$queryRawUnsafe(tableQuery);


    /* ---------------- TOTAL COUNT ---------------- */

    const totalCountResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(DISTINCT ir.registrar_id) AS total
      FROM master_issuer mi
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
    `);

    const totalRecords = totalCountResult[0]?.total || 0;


    /* ---------------- SECTOR BREAKUP QUERY ---------------- */

    const sectorValueSelect =
      issueType === 'count'
        ? 'COUNT(mi.isin)'
        : 'ROUND(SUM(mi.issue_size) / 10000000, 2)';

    /**
     * Ranked registrars — SAME LOGIC as tableQuery
     */
    const rankedRegistrarsSubQuery =
      issueType === 'count'
        ? `
      SELECT
        mr.id AS registrar_id,
        mr.short_name AS registrar_name,
        RANK() OVER (
          ORDER BY COUNT(mi.isin) DESC, SUM(mi.issue_size) DESC
        ) AS arr_rank
      FROM master_issuer mi
      JOIN issuer_details idet ON idet.id = mi.issuer_master_id
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
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
      JOIN issuer_details idet ON idet.id = mi.issuer_master_id
      JOIN issuer_registrar ir ON ir.issuer_id = mi.id
      JOIN master_registrar mr ON mr.id = ir.registrar_id
      WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                                  AND '${formatDate(currentEndDate)}'
      GROUP BY ir.registrar_id
      ORDER BY arr_rank
      LIMIT 10
    `;

    const sectorQuery = `
  SELECT
    r.registrar_id AS id,
    r.registrar_name AS issuer_name,
    r.arr_rank,
    mbs.code,
    mbs.description,
    ${sectorValueSelect} AS value
  FROM (${rankedRegistrarsSubQuery}) r
  JOIN issuer_registrar ir
    ON ir.registrar_id = r.registrar_id
  JOIN master_issuer mi
    ON mi.id = ir.issuer_id
  JOIN master_business_sector mbs
    ON mi.business_sector = mbs.code
  WHERE mi.allotment_date BETWEEN '${formatDate(currentStartDate)}'
                              AND '${formatDate(currentEndDate)}'
  GROUP BY
    r.registrar_id,
    r.registrar_name,
    r.arr_rank,
    mi.business_sector
  ORDER BY
    r.arr_rank,
    value DESC;
`;

    const sectorData = await prisma.$queryRawUnsafe(sectorQuery);

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
        limit,
        offset
      }
    });


  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Failed to fetch registrars data',
      message: error.message
    });
  }
});

app.post('/registrars_page_credit_rating_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const formatDate = (date) => {
      const d = new Date(date);
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };

    const start = formatDate(new Date(startDate));
    const end = formatDate(new Date(endDate));

    /* ---------------- TOTAL COUNT ---------------- */

    const totalResult = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) AS aggregate
      FROM \`master_issuer_rating\` mir
      JOIN \`master_issuer\` mi ON mi.id = mir.issuer_id
      JOIN \`issuer_registrar\` ir ON ir.issuer_id = mi.id
      WHERE mi.allotment_date BETWEEN '${start}' AND '${end}'
    `);

    const totalCount = parseInt(totalResult[0]?.aggregate) || 0;

    if (totalCount === 0) {
      return res.status(200).json({
        ratingData: [],
        totalCount: 0
      });
    }

    /* ---------------- RATING DISTRIBUTION ---------------- */

    const ratingDataQuery = `
      SELECT
        mir.rating AS name,
        ROUND((COUNT(mir.id) / ${totalCount} * 100), 2) AS percentage,
        COUNT(mir.id) AS rating_no,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, '0'), -6)) AS color
      FROM \`master_issuer_rating\` mir
      JOIN \`master_issuer\` mi ON mi.id = mir.issuer_id
      JOIN \`issuer_registrar\` ir ON ir.issuer_id = mi.id
      WHERE mi.allotment_date BETWEEN '${start}' AND '${end}'
      GROUP BY mir.rating
      ORDER BY mir.rating ASC
    `;

    const ratingData = await prisma.$queryRawUnsafe(ratingDataQuery);

    res.status(200).json({
      ratingData: ratingData,
      totalCount: totalCount
    });

  } catch (error) {
    console.error('Error in registrars_page_credit_rating_data:', error);
    res.status(500).json({
      error: 'Failed to fetch registrars credit rating data',
      message: error.message
    });
  }
});





//Dashboard APIs



app.post('/dashboard_specific_entity_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, issuerId } = req.body;

    const sectorQuery = `
      select 
      b.description as business_name, 
      COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size, 
      concat("#",SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color ,
      COUNT(isin) AS no_of_issue
      from master_issuer 
      inner join master_business_sector as b on b.code = master_issuer.business_sector 
      where allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
      and business_sector is not null and issuer_master_id = ${issuerId}
      group by master_issuer.business_sector
      order by issue_size DESC 
      limit 10
    `;
    const monthQuery = `
     select
      MONTH(master_issuer.allotment_date) as issue_month_no,
      MONTH(master_issuer.allotment_date) as allotment_month, a.month_name as issue_month,
      ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS issue_size,
      SUM(master_issuer.issue_size) AS actual_issue_size,
      CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color,
      COUNT(master_issuer.isin) AS no_of_issue
      from master_issuer
      join all_months as a on a.month_no = MONTH(master_issuer.allotment_date)
      where master_issuer.allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
      and issuer_master_id = ${issuerId}
      group by issue_month_no
      order by a.id asc
    `;
    const creditRatingQuery = `
      select 
      master_issuer_rating.rating, 
      w.description as watch, 
      master_issuer_rating.outlook, 
      master_issuer_rating.rating_date, 
      i.isin, master_agency.short_name as agency_name 
      from master_issuer_rating left join master_agency 
      on master_agency.id = master_issuer_rating.agency_id 
      left join master_credit_rating_watch as w on w.code = master_issuer_rating.watch 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where issuer_master_id = ${issuerId} 
      and i.allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'  and FIND_IN_SET(i.id,master_issuer_rating.issuer_id) 
      order by master_issuer_rating.rating_date asc
    `;

    const issuerDetailQuery = `
      select * from issuer_details where id = ${issuerId}
    `;

    const [sectorData, monthData, creditRatingData, issuerDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(issuerDetailQuery)
    ]);

    res.status(200).json({ sectorData, monthData, creditRatingData, issuerDetailsData });
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});


function getUpcomingMarch31(today) {

  const currentYear = today.getFullYear();

  // Create March 31 for the current year
  let march31 = new Date(currentYear, 2, 31, 0, 0, 0); // Month is 0-based (2 = March)

  // If today is after March 31, take next year's March 31
  if (today > march31) {
    march31 = new Date(currentYear + 1, 2, 31, 0, 0, 0);
  }

  return march31;
}

app.get('/current_year_debt_redemption_data', async (req, res) => {
  try {

    const now = new Date();

    const nextYear = getUpcomingMarch31(now);

    const redemptionData = await prisma.$queryRawUnsafe(`
        SELECT
          MONTH(maturity_date) AS month,
          MONTHNAME(maturity_date) AS label,
          YEAR(maturity_date) AS year,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          COUNT(isin) AS isin_count
        FROM master_issuer
        WHERE maturity_date BETWEEN '${formatDate(now)}' AND '${formatDate(nextYear)}'
        GROUP BY month
        ORDER BY month ASC
      `);

    res.json(redemptionData);
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
})


app.post('/debt_redemption_specific_month_data', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const monthRedemptionData = await prisma.$queryRawUnsafe(`     
        SELECT 
            i.id AS id,
            i.isin,
            id.issuer_name AS issuerName,
            i.allotment_date AS allotmentDate,
            icd.coupon_rate AS couponRate,
            mt.short_name AS debentureTrustee,
            mr.short_name AS registrar,
            i.maturity_date AS maturityDate,
            GROUP_CONCAT(mir.rating) AS creditRating,
            ma.short_name AS arranger,
            i.security_name AS securityName,
            s.description AS securityType ,
            mi.description AS modeOfIssue,
            i.issue_size AS issueSize,
            i.face_value AS faceValue,
            GROUP_CONCAT(mag.short_name) AS creditRatingAgency,
            mstc.description AS seniority,
            tf.description AS taxFree,
            msf.description AS securedFlag,
            (
                SELECT description
                FROM master_issuer_stock_exchange AS mise
                LEFT JOIN master_listing_status AS mls ON mls.code = mise.listing_status
                WHERE issuer_id = i.id
                ORDER BY listing_status
                LIMIT 1
            ) AS listingStatus
        FROM all_months
        INNER JOIN master_issuer AS i ON all_months.month_no = MONTH(i.allotment_date)
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
        WHERE i.maturity_date BETWEEN '${startDate}' AND '${endDate}'
        GROUP BY i.isin
        ORDER BY issuer_name ASC
        LIMIT 25 OFFSET 0;
        
      `);

    res.json(monthRedemptionData);
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
})





//issuerpage APIs
app.post('/issuePage_outstanding_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;

    const greaterDate = getDate(frequency, lessYear);

    const issueData = await prisma.$queryRawUnsafe(`
          SELECT
            MONTH(allotment_date) AS month,
            MONTHNAME(allotment_date) AS label,
            ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
            COUNT(isin) AS isin_count
          FROM master_issuer
          WHERE allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterDate} 23:59:59'
          GROUP BY month
          ORDER BY month ASC
      `);

    const redemptionData = await prisma.$queryRawUnsafe(`
        SELECT
          MONTH(maturity_date) AS month,
          MONTHNAME(maturity_date) AS label,
          ROUND(SUM(issue_size) / 10000000, 2) AS issue_size,
          COUNT(isin) AS isin_count
        FROM master_issuer
        WHERE maturity_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterDate} 23:59:59'
        GROUP BY month
        ORDER BY month ASC
      `);

    const monthRanges = [
      { label: 'April', start: `${lessYear}-04-01`, end: `${lessYear}-04-30` },
      { label: 'May', start: `${lessYear}-05-01`, end: `${lessYear}-05-31` },
      { label: 'June', start: `${lessYear}-06-01`, end: `${lessYear}-06-30` },
      { label: 'July', start: `${lessYear}-07-01`, end: `${lessYear}-07-31` },
      { label: 'August', start: `${lessYear}-08-01`, end: `${lessYear}-08-31` },
      { label: 'September', start: `${lessYear}-09-01`, end: `${lessYear}-09-30` },
      { label: 'October', start: `${lessYear}-10-01`, end: `${lessYear}-10-31` },
      { label: 'November', start: `${lessYear}-11-01`, end: `${lessYear}-11-30` },
      { label: 'December', start: `${lessYear}-12-01`, end: `${lessYear}-12-31` },
      { label: 'January', start: `${greaterYear}-01-01`, end: `${greaterYear}-01-31` },
      { label: 'February', start: `${greaterYear}-02-01`, end: `${greaterYear}-02-28` },
      { label: 'March', start: `${greaterYear}-03-01`, end: `${greaterYear}-03-31` }
    ];

    const filteredMonthRanges = getFilteredMonths(frequency, monthRanges);

    const outstandingPromises = filteredMonthRanges?.map(async ({ label, start, end }) => {
      const [result] = await prisma.$queryRawUnsafe(`
          SELECT ROUND(SUM(issue_size) / 10000000, 2) AS aggregate
          FROM master_issuer
          WHERE allotment_date < '${start}'
            AND maturity_date > '${end}'
            AND security_status = 1
        `);
      return {
        label,
        outstanding: result?.aggregate || 0
      };
    });

    const outstandingData = await Promise.all(outstandingPromises);


    const formattedData = filteredMonthRanges?.map(({ label }) => {
      const issue = issueData?.find(item => item?.label === label);
      const redemption = redemptionData?.find(item => item?.label === label);
      const outstanding = outstandingData?.find(item => item?.label === label);

      return {
        month: getShortMonthName(label) || label,
        issue: issue?.issue_size || 0,
        redemption: redemption?.issue_size || 0,
        outstanding: outstanding?.outstanding || 0
      };
    })


    // Response
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.post('/issuePage_issuer_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      `)
    const result = await prisma.$queryRawUnsafe(`
      SELECT
      table1.id AS id,
      table1.issuer_name AS issuer_name,
      table1.no_issues AS cy_issues,
      table1.issue_size AS cy_issue_size,
      table1.arr_rank AS cy_arr_rank,
      table2.no_issues AS py_issues,
      table2.issue_size AS py_issue_size,
      table2.arr_rank AS py_arr_rank,
      ROUND( (table1.issue_size /  ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
      ROUND( (table2.issue_size /  ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
      (
      case
      when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
      else
      ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
      end
      ) as yoy
      FROM
      (select
      issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
      from master_issuer
      join issuer_details on issuer_details.id=master_issuer.issuer_master_id
      where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      group by issuer_details.id
      order by arr_rank
      limit 10
      ) as table1
      left JOIN
      (select
      issuer_details.id,issuer_details.issuer_name,count(isin) as no_issues,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
      from master_issuer
      join issuer_details on issuer_details.id=master_issuer.issuer_master_id
      where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      group by issuer_details.id) as table2
      on table1.id=table2.id
      order by table1.arr_rank asc;
    `);

    const finalResult = result?.map((item) => {
      return {
        id: item?.id || '-',
        rank: item?.cy_arr_rank || '-',
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || '-',
        currentDeals: item?.cy_issues || '-',
        currentMarketShare: item?.cy_mkt_share || '-',
        previousRank: item?.py_arr_rank || '-',
        previousSize: item?.py_issue_size || '-',
        previousDeals: item?.py_issues || '-',
        previousMarketShare: item?.py_mkt_share || '-',
        yoyChange: item?.yoy || '-'
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.post('/issuePage_top_sectors_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);
    const result = await prisma.$queryRawUnsafe(`
      SELECT
      table1.business_sector AS id,
      table1.sector_name AS sector_name,
      table1.issue_size AS cy_issue_size,
      table2.issue_size AS py_issue_size
      FROM
      (select
      master_issuer.business_sector,master_business_sector.description as sector_name,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      count(isin) as issue_no
      from master_issuer
      join master_business_sector on master_issuer.business_sector=master_business_sector.code
      where allotment_date between '${lessYear}-01-01 00:00:00' and '${greaterDate} 23:59:59'
      group by master_issuer.business_sector
      order by issue_size desc
      limit 10
      ) as table1
      JOIN
      (
      select
      master_issuer.business_sector,master_business_sector.description as sector_name,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      count(isin) as issue_no
      from master_issuer
      join master_business_sector on master_issuer.business_sector=master_business_sector.code
      where allotment_date between '${Number(lessYear) - 1}-01-01 00:00:00' and '${lessYearDate} 23:59:59'
      group by master_issuer.business_sector
      order by issue_size
      ) as table2
      on table1.business_sector=table2.business_sector
      order by cy_issue_size desc
    `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.sector_name || '-',
        value: item?.cy_issue_size || null,
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard_table', message: error.message });
  }
});

app.post('/issuePage_agency_rating_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalRatingNo = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;
      `)
    const result = await prisma.$queryRawUnsafe(`
      select 
      master_agency.short_name as label, 
      ROUND((COUNT(master_issuer_rating.rating)/(${totalRatingNo[0]?.aggregate || 1}) * 100) ,2) as percentage, 
      COUNT(master_issuer_rating.id) as rating_no ,
      concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
      master_issuer_rating.rating from master_agency 
      inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where i.allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      group by master_issuer_rating.agency_id
    `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});

app.post('/issuePage_debt_redemption__data', async (req, res) => {
  try {
    const { lessYear, monthName } = req.body;

    const month = {
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'May': '05',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12'
    };
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        issuer_details.id, 
        maturity_date AS maturity_date,
        issuer_name AS name, 
        COUNT(isin) AS noIssuer, 
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize ,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM issuer_details 
      INNER JOIN master_issuer 
        ON master_issuer.issuer_master_id = issuer_details.id 
      WHERE maturity_date BETWEEN '${lessYear}-${month[`${monthName}`]}-01 00:00:00' AND '${lessYear}-${month[`${monthName}`]}-31 23:59:59' 
      GROUP BY issuer_details.id 
      ORDER BY SUM(issue_size) DESC 
      LIMIT 10;
    `);

    // const finalResult = result?.map((item)=>{
    //   return  { 
    //     name: item?.rating || 'undefined', 
    //     percentage: Number(item?.percentage * 100) || null, 
    //     rating_no: Number(item?.rating_no) || null,
    //     color: item?.color || 'undefined',
    //     label: item?.label || 'undefined'
    //   }
    // })


    res.status(200).json(result);
  } catch (error) {
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
    listingStatus = ""
  } = req.body;

  try {
    // Build WHERE conditions dynamically
    const conditions = [];
    const params = [];

    // Add base condition for date range
    conditions.push(`master_issuer.allotment_date BETWEEN ? AND ?`);
    params.push(startDate, endDate);

    // Add other conditions
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

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query for data with pagination
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
      LEFT JOIN (
        SELECT 
          mise.issuer_id, 
          mls.description AS listing_status, 
          mise.listing_status AS listing_status_code
        FROM master_issuer_stock_exchange mise
        LEFT JOIN master_listing_status mls 
          ON mls.code = mise.listing_status
        WHERE mise.listing_status IS NOT NULL
        GROUP BY mise.issuer_id, mls.description, mise.listing_status
      ) AS listing_data
      ON listing_data.issuer_id = master_issuer.id
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
        ON issuer_coupon_details.issuer_id = issuer_details.id
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
      ${whereClause}
      ORDER BY master_issuer.allotment_date ASC
      LIMIT ? OFFSET ?
    `;

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM master_issuer
      ${whereClause}
    `;



    // Execute both queries in parallel
    const [result, countResult] = await Promise.all([
      prisma.$queryRawUnsafe(dataQuery, ...params, limit, offset),
      prisma.$queryRawUnsafe(countQuery, ...params)
    ]);

    const total = countResult[0]?.total || 0;

    const finalResult = result?.map((item) => {
      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
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
      }
    });

    // Return data with pagination info
    res.status(200).json({
      data: finalResult,
      pagination: {
        total: parseInt(total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(total)
      }
    });
  } catch (error) {
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
    res.status(500).json({ error: 'Failed to issuepage_filterinputs_data', message: error.message });
  }
});


app.post('/issuePage_specific_isin_detailed_data', async (req, res) => {
  const { limit = 25, offset = 0, masterIssuerId } = req.body;
  try {
    const resultQuery = `
        SELECT 
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
          master_issuer.stipulation_details ,
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
        LEFT JOIN (
          SELECT 
            mise.issuer_id, 
            mls.description AS listing_status, 
            mise.listing_status AS listing_status_code
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls 
            ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id, mls.description, mise.listing_status
        ) AS listing_data
        ON listing_data.issuer_id = master_issuer.id
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
          ON issuer_coupon_details.issuer_id = issuer_details.id
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

        WHERE 
          master_issuer.id in (${masterIssuerId})
        ORDER BY master_issuer.allotment_date ASC
        
        LIMIT ${limit} OFFSET ${offset};
     `;

    const couponTypeDataQuery = `
        select 
        issuer_id, 
        coupon_pay_date, 
        coupon_rate_date, 
        coupon_rate ,
        master_coupon_type.description as coupon_type
        from issuer_coupon_details 
        left join master_coupon_type
        on master_coupon_type.code = issuer_coupon_details.coupon_type
        where issuer_coupon_details.issuer_id in (${masterIssuerId})
      `;

    const tenureDataQuery = `
           select 
            issuer_id, 
            tenure, 
            tenure_no_years, 
            tenure_no_months, 
             tenure_no_days 
          from issuer_tenure_details 
          where issuer_tenure_details.issuer_id in (${masterIssuerId})
      `;

    const redemptionTypeDataQuery = `
          select 
          issuer_id, 
          redmp_premimum_date, 
          defaultinredmptn, 
          redmp_details ,
          master_redemption_type.description as type_redmptn
          from issuer_redemption_details 
          left join master_redemption_type
          on master_redemption_type.code = issuer_redemption_details.type_redmptn
          where issuer_redemption_details.issuer_id in (${masterIssuerId})
        `;

    const masterIssuerAdditionalDataQuery = `
          select 
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
          from master_issuer_additional 
          where master_issuer_additional.issuer_id in (${masterIssuerId})
        `;


    const [result, couponTypeData, tenureData, redemptionTypeData, masterIssuerAdditionalData] = await Promise.all([
      prisma.$queryRawUnsafe(resultQuery),
      prisma.$queryRawUnsafe(couponTypeDataQuery),
      prisma.$queryRawUnsafe(tenureDataQuery),
      prisma.$queryRawUnsafe(redemptionTypeDataQuery),
      prisma.$queryRawUnsafe(masterIssuerAdditionalDataQuery)
    ]);

    const overAll = {
      ...result[0],
      ...couponTypeData[0],
      ...tenureData[0],
      ...redemptionTypeData[0],
      ...masterIssuerAdditionalData[0]
    }


    // const merged = Object.assign(
    //   {},
    //   ...result,
    //   ...couponTypeData,
    //   ...tenureData,
    //   ...redemptionTypeData,
    //   ...masterIssuerAdditionalData
    // );

    res.status(200).json(overAll);


    // res.status(200).json({...result,...couponTypeData,...tenureData,...redemptionTypeData,...masterIssuerAdditionalData});
    // res.status(200).json({result,couponTypeData,tenureData,redemptionTypeData,masterIssuerAdditionalData});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch issuePage_specific_isin_detailed_data', message: error.message });
  }

});


//arranger page
app.post('/arrangerPage_arranger_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      `)
    const result = await prisma.$queryRawUnsafe(`
      SELECT
      table1.id AS id,
      table1.issuer_name AS issuer_name,
      table1.no_issues AS cy_issues,
      table1.issue_size AS cy_issue_size,
      table1.arr_rank AS cy_arr_rank,
      table2.no_issues AS py_issues,
      table2.issue_size AS py_issue_size,
      table2.arr_rank AS py_arr_rank,
      ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
      ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
      (
      case
      when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
      else
      ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
      end
      ) as yoy
      FROM
      (select
      master_arranger.id,master_arranger.short_name as issuer_name,count(isin) as no_issues,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
      from master_issuer
      join issuer_arranger on issuer_arranger.issuer_id=master_issuer.id
      join issuer_details on issuer_details.id=master_issuer.issuer_master_id
      join master_arranger on master_arranger.id=issuer_arranger.arranger_id
      where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      group by issuer_arranger.arranger_id
      order by arr_rank
      limit 10
      ) as table1
      left JOIN
      (select
      master_arranger.id,master_arranger.short_name as issuer_name,count(isin) as no_issues,
      ROUND(SUM(issue_size) / 10000000,2) as issue_size,
      RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
      from master_issuer
      join issuer_details on issuer_details.id=master_issuer.issuer_master_id
      join issuer_arranger on issuer_arranger.issuer_id=master_issuer.id
      join master_arranger on master_arranger.id=issuer_arranger.arranger_id
      where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      group by issuer_arranger.arranger_id) as table2
      on table1.id=table2.id
      order by table1.arr_rank asc;
    `);

    const finalResult = result?.map((item, index) => {
      return {
        rank: item?.cy_arr_rank || null,
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || null,
        currentDeals: Number(item?.cy_issues) || null,
        currentMarketShare: item?.cy_mkt_share || null,
        previousRank: Number(item?.py_arr_rank) || null,
        previousSize: item?.py_issue_size || null,
        previousDeals: Number(item?.py_issues) || null,
        previousMarketShare: item?.py_mkt_share || null,
        yoyChange: item?.yoy || null,
        id: item?.id || '-',
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});


app.post('/arrangerPage_sector_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);
    const result = await prisma.$queryRawUnsafe(`
        SELECT 
          issuer_arranger.arranger_id AS id,
          master_business_sector.code,
          master_business_sector.description,
          ROUND(SUM(issue_size) / 10000000, 2) AS value
        FROM 
          master_issuer
        INNER JOIN 
          master_business_sector 
          ON master_issuer.business_sector = master_business_sector.code
        INNER JOIN 
          issuer_arranger 
          ON master_issuer.id = issuer_arranger.issuer_id
        WHERE 
          allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterDate} 23:59:59'
          AND issuer_arranger.arranger_id IN (132, 14, 7, 2, 10, 32, 133, 12, 34, 95)
        GROUP BY 
          master_issuer.business_sector
        ORDER BY 
          value DESC
        LIMIT 10;
      `);


    const finalResult = result?.map((item, index) => {
      return {
        value: item?.value || null,
        name: item?.description || '-',
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch arranger sector data', message: error.message });
  }
});

app.post('/arrangerPage_debt_redemption__data', async (req, res) => {
  try {
    const { lessYear, monthName } = req.body;

    const month = {
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'May': '05',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12'
    };
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        master_arranger.short_name AS arranger_name,
        master_issuer.maturity_date AS maturity_date,
        COALESCE(ROUND(SUM(master_issuer.issue_size) / 10000000), 0) AS issue_size
      FROM master_issuer
      JOIN issuer_arranger 
        ON issuer_arranger.issuer_id = master_issuer.id
      JOIN issuer_details 
        ON issuer_details.id = master_issuer.issuer_master_id
      JOIN master_arranger 
        ON master_arranger.id = issuer_arranger.arranger_id
      WHERE master_issuer.maturity_date BETWEEN '${lessYear}-${month[`${monthName}`]}-01 00:00:00' 
                                          AND '${lessYear}-${month[`${monthName}`]}-31 23:59:59'
      GROUP BY master_arranger.short_name, master_issuer.maturity_date
      ORDER BY issue_size DESC
      LIMIT 10;

    `);

    // const finalResult = result?.map((item)=>{
    //   return  { 
    //     name: item?.rating || 'undefined', 
    //     percentage: Number(item?.percentage * 100) || null, 
    //     rating_no: Number(item?.rating_no) || null,
    //     color: item?.color || 'undefined',
    //     label: item?.label || 'undefined'
    //   }
    // })


    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});

app.post('/arrangerPage_agency_rating_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalRatingNo = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;
      `)
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        master_agency.short_name AS label,
        ROUND((COUNT(master_issuer_rating.rating) / (${totalRatingNo[0]?.aggregate || 1}) * 100), 2) AS percentage,
        COUNT(master_issuer_rating.id) AS rating_no,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color,
        master_issuer_rating.rating
      FROM master_agency
      INNER JOIN master_issuer_rating 
        ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer AS i 
        ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_arranger 
        ON issuer_arranger.issuer_id = i.id
      WHERE i.allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterDate} 23:59:59'
      GROUP BY master_issuer_rating.rating;

    `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
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
    isin = ""
  } = req.body;
  try {
    const result = await prisma.$queryRawUnsafe(`
        select  
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date,
        master_arranger.short_name AS Arranger,
        master_issuer_ownership_type.description AS ownership_type,
        master_issuer_type_nature.description AS nature,
        master_business_sector.description AS sector,
        issuer_details.issuer_name AS issuer_name,
        master_security_type.description AS security_type,
        master_mode_issue.description AS mode_of_issue,
        issuer_coupon_details.coupon_rate,
        master_issuer_rating.rating AS credit_rating,
        listing_data.listing_status AS listing_status,
          listing_data.listing_status_code AS listing_status_code,
          master_agency.short_name AS credit_rating_agency,
          master_trustee.short_name AS debenture_trustee,
          master_registrar.registrar_name AS Registrar,
          master_seniority_tier_classification.description AS Seniority,
                  master_tax_free.description AS tax_free,
                  master_secured_flag.description AS secured_flag
        from master_issuer
        LEFT JOIN (
          SELECT 
            mise.issuer_id, 
            mls.description AS listing_status, 
            mise.listing_status AS listing_status_code
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls 
            ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id, mls.description, mise.listing_status
        ) AS listing_data
        ON listing_data.issuer_id = master_issuer.id
        LEFT JOIN issuer_arranger 
          ON master_issuer.id = issuer_arranger.issuer_id

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
        LEFT JOIN issuer_trustee 
          ON issuer_trustee.issuer_id = master_issuer.id
        LEFT JOIN master_trustee 
          ON master_trustee.id = issuer_trustee.trustee_id
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
        where exists (select * from issuer_arranger where master_issuer.id = issuer_arranger.issuer_id) 
        and master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}' 
        ${issuerName ? `AND issuer_details.issuer_name LIKE '${issuerName}'` : ''}
        ${rating ? `AND master_issuer_rating.rating = '${rating}'` : ''}
        ${dealSize ? `AND master_issuer.issue_size LIKE '${dealSize}'` : ''}
        ${listingStatus ? `AND listing_data.listing_status = '${listingStatus}'` : ''}
        ${seniority ? `AND master_seniority_tier_classification.description = '${seniority}'` : ''}
        ${taxFree ? `AND master_tax_free.description = '${taxFree}'` : ''}
        ${securedFlag ? `AND master_secured_flag.description = '${securedFlag}'` : ''}
        ${sector ? `AND master_business_sector.description = '${sector}'` : ''}
        ${trustee ? `AND master_trustee.short_name = '${trustee}'` : ''}
        ${nature ? `AND master_issuer_type_nature.description = '${nature}'` : ''}
        ${ownershipType ? `AND master_issuer_ownership_type.description = '${ownershipType}'` : ''}
        ${creditRatingAgency ? `AND master_agency.short_name = '${creditRatingAgency}'` : ''}
        ${isin ? `AND master_issuer.isin LIKE '${isin}'` : ''}
        ${arranger ? `AND master_arranger.short_name LIKE '${arranger}'` : ''}
        order by master_issuer.allotment_date asc 
        LIMIT ${limit} OFFSET ${offset};
     `);


    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
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
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch detailed issuepage data', message: error.message });
  }

});

app.post('/arranger_specific_entity_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, arrangerId } = req.body;

    const sectorQuery = `
      select
          b.description as business_name,
          COALESCE((ROUND(SUM(issue_size)/10000000)),0) as issue_size,
          concat("#", SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
          COUNT(isin) AS no_of_issue
      from master_issuer
      inner join master_business_sector as b on b.code = master_issuer.business_sector
      inner join issuer_arranger on issuer_arranger.issuer_id = master_issuer.id
      where allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
          and business_sector is not null
          and issuer_arranger.arranger_id = ${arrangerId}
      group by master_issuer.business_sector
      order by issue_size DESC
      limit 10
    `;
    const monthQuery = `
      select
      MONTH(master_issuer.allotment_date) as issue_month_no, 
      MONTH(master_issuer.allotment_date) as allotment_month, 
      a.month_name as issue_month,
      ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS issue_size,
      SUM(master_issuer.issue_size) AS actual_issue_size,
      CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color,
      COUNT(master_issuer.isin) AS no_of_issue
      from master_issuer
      join all_months as a on a.month_no = MONTH(master_issuer.allotment_date)
      join issuer_arranger on issuer_arranger.issuer_id = master_issuer.id
      where master_issuer.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
      and issuer_arranger.arranger_id = ${arrangerId}
      group by allotment_month
      order by a.id asc
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating;
    `)
    const creditRatingQuery = `
      select master_agency.short_name as label, 
      ROUND((COUNT(master_issuer_rating.rating)/(${totalRatingNo[0]?.aggregate || 1}) * 100) ,2) as percentage, 
      COUNT(master_issuer_rating.id) as rating_no,
      concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
      master_issuer_rating.rating  as name
      from master_agency 
      inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      inner join issuer_arranger on issuer_arranger.issuer_id = i.id 
      where i.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
      and issuer_arranger.arranger_id = ${arrangerId} 
      group by master_issuer_rating.agency_id
    `;

    const arrangerDetailQuery = `
      select * from master_arranger where id = ${arrangerId}
    `;

    const [sectorData, monthData, creditRatingData, arrangerDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(arrangerDetailQuery)
    ]);

    res.status(200).json({ sectorData, monthData, creditRatingData, arrangerDetailsData });
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});

app.post('/arranger_specific_deals_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, arrangerId } = req.body;

    const result = await prisma.$queryRawUnsafe(`
      SELECT i.id AS issuerId, i.isin, id.issuer_name, i.allotment_date, icd.coupon_rate, mt.short_name AS debenture_trustee_name, mr.short_name AS registrar_detail, i.maturity_date, GROUP_CONCAT(mir.rating) AS rating, ma.short_name AS arranger_name, i.security_name, s.description AS security_type, mi.description AS mode_issue, i.issue_size, i.face_value, GROUP_CONCAT(mag.short_name) AS agency_name, mstc.description AS seniority, tf.description AS tax_free, msf.description AS secured_flag,
          (SELECT description
          FROM master_issuer_stock_exchange AS mise
          LEFT JOIN master_listing_status AS mls ON mls.code = mise.listing_status
          WHERE issuer_id = i.id
          ORDER BY listing_status
          LIMIT 1) AS listing_status
      FROM all_months
      INNER JOIN master_issuer AS i ON all_months.month_no = MONTH(i.allotment_date)
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
      WHERE ia.arranger_id = ${arrangerId}
          AND i.allotment_date BETWEEN '${lessYear}-04-01 00:00:00' and '${greaterYear}-03-31 23:59:59'
      GROUP BY ia.arranger_id, i.isin, i.id
      ORDER BY issuer_name ASC
      LIMIT 25 OFFSET 0
    `)

    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return {
        id: item?.issuerId || item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_issue || item?.mode_of_issue || '-',
        issueSize: item?.issue_size || null,
        faceValue: item?.face_value || null,
        allotmentDate: item?.allotment_date ? allotment : '-',
        maturityDate: item?.maturity_date ? maturity : '-',
        couponRate: item?.coupon_rate || '-',
        creditRatingAgency: item?.agency_name || item?.credit_rating_agency || '-',
        creditRating: item?.rating || item?.credit_rating || '-',
        debentureTrustee: item?.debenture_trustee_name || item?.debenture_trustee || '-',
        registrar: item?.registrar_detail || item?.Registrar || '-',
        arranger: item?.arranger_name || item?.Arranger || '-',
        seniority: item?.seniority || item?.Seniority || '-',
        taxFree: item?.tax_free || '-',
        securedFlag: item?.secured_flag || '-',
        listingStatus: item?.listing_status || '-',

      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});


//trustee page
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
    isin = ""
  } = req.body;
  try {
    const result = await prisma.$queryRawUnsafe(`
        select 
        master_issuer.id,
        master_issuer.isin,
        master_issuer.security_name,
        master_issuer.issue_size,
        master_issuer.face_value,
        master_issuer.allotment_date,
        master_issuer.maturity_date, 
        master_trustee.short_name AS debenture_trustee,
        master_arranger.short_name AS Arranger,
        master_issuer_ownership_type.description AS ownership_type,
        master_issuer_type_nature.description AS nature,
        master_business_sector.description AS sector,
        issuer_details.issuer_name AS issuer_name,
        master_security_type.description AS security_type,
        master_mode_issue.description AS mode_of_issue,
        issuer_coupon_details.coupon_rate,
        master_issuer_rating.rating AS credit_rating,
        listing_data.listing_status AS listing_status,
        listing_data.listing_status_code AS listing_status_code,
        master_agency.short_name AS credit_rating_agency,
        master_registrar.registrar_name AS Registrar,
        master_seniority_tier_classification.description AS Seniority,
        master_tax_free.description AS tax_free,
        master_secured_flag.description AS secured_flag
        from master_issuer 
        LEFT JOIN (
          SELECT 
            mise.issuer_id, 
            mls.description AS listing_status, 
            mise.listing_status AS listing_status_code
          FROM master_issuer_stock_exchange mise
          LEFT JOIN master_listing_status mls 
            ON mls.code = mise.listing_status
          WHERE mise.listing_status IS NOT NULL
          GROUP BY mise.issuer_id, mls.description, mise.listing_status
        ) AS listing_data
        ON listing_data.issuer_id = master_issuer.id
        LEFT JOIN issuer_trustee 
          ON master_issuer.id = issuer_trustee.issuer_id
        LEFT JOIN master_trustee 
          ON master_trustee.id = issuer_trustee.trustee_id
        LEFT JOIN issuer_arranger 
          ON master_issuer.id = issuer_arranger.issuer_id
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
          ON issuer_registrar.issuer_id = master_issuer.issuer_master_id
        LEFT JOIN master_registrar 
          ON master_registrar.id = issuer_registrar.registrar_id
          LEFT JOIN master_seniority_tier_classification 
          ON master_seniority_tier_classification.code = master_issuer.seniority
        LEFT JOIN master_tax_free 
          ON master_tax_free.code = master_issuer.tax_free
        LEFT JOIN master_secured_flag 
          ON master_secured_flag.code = master_issuer.secured_flag
        where exists (select * from issuer_trustee where master_issuer.id = issuer_trustee.issuer_id) 
        and master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}' 
        ${issuerName ? `AND issuer_details.issuer_name LIKE '${issuerName}'` : ''}
        ${rating ? `AND master_issuer_rating.rating = '${rating}'` : ''}
        ${dealSize ? `AND master_issuer.issue_size LIKE '${dealSize}'` : ''}
        ${listingStatus ? `AND listing_data.listing_status = '${listingStatus}'` : ''}
        ${seniority ? `AND master_seniority_tier_classification.description = '${seniority}'` : ''}
        ${taxFree ? `AND master_tax_free.description = '${taxFree}'` : ''}
        ${securedFlag ? `AND master_secured_flag.description = '${securedFlag}'` : ''}
        ${sector ? `AND master_business_sector.description = '${sector}'` : ''}
        ${trustee ? `AND master_trustee.short_name LIKE '${trustee}'` : ''}
        ${nature ? `AND master_issuer_type_nature.description = '${nature}'` : ''}
        ${ownershipType ? `AND master_issuer_ownership_type.description = '${ownershipType}'` : ''}
        ${creditRatingAgency ? `AND master_agency.short_name = '${creditRatingAgency}'` : ''}
        ${isin ? `AND master_issuer.isin LIKE '${isin}'` : ''}
        ${arranger ? `AND master_arranger.short_name LIKE '${arranger}'` : ''}
        order by master_issuer.allotment_date asc 
        LIMIT ${limit} OFFSET ${offset};
     `);


    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size || '-',
        faceValue: item?.face_value || '-',
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
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch detailed trusteepage data', message: error.message });
  }

});

app.post('/trusteePage_trustee_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      `)
    const result = await prisma.$queryRawUnsafe(`
        SELECT
        table1.id AS id,
        table1.issuer_name AS issuer_name,
        table1.no_issues AS cy_issues,
        table1.issue_size AS cy_issue_size,
        table1.arr_rank AS cy_arr_rank,
        table2.no_issues AS py_issues,
        table2.issue_size AS py_issue_size,
        table2.arr_rank AS py_arr_rank,
        ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
        ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
        (
        case
        when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
        else
        ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
        end
        ) as yoy
        FROM
        (select
        master_trustee.id,master_trustee.short_name as issuer_name,count(isin) as no_issues,
        ROUND(SUM(issue_size) / 10000000,2) as issue_size,
        RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
        join issuer_details on issuer_details.id=master_issuer.issuer_master_id
        join issuer_trustee on issuer_trustee.issuer_id = master_issuer.id
        join master_trustee on master_trustee.id = issuer_trustee.trustee_id
        where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
        group by issuer_trustee.trustee_id
        order by arr_rank
        limit 10
        ) as table1
        left JOIN
        (select
        master_trustee.id,master_trustee.short_name as issuer_name,count(isin) as no_issues,
        ROUND(SUM(issue_size) / 10000000,2) as issue_size,
        RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
        join issuer_details on issuer_details.id=master_issuer.issuer_master_id
        join issuer_trustee on issuer_trustee.issuer_id = master_issuer.id
        join master_trustee on master_trustee.id = issuer_trustee.trustee_id
        where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
        group by issuer_trustee.trustee_id) as table2
        on table1.id=table2.id
        order by table1.arr_rank asc;
      `);

    const trusteeIds = result?.map(item => Number(item.id)) || [];

    const resultSectors = await prisma.$queryRawUnsafe(`
      SELECT 
        issuer_trustee.trustee_id AS id,
        master_business_sector.code,
        master_business_sector.description,
        ROUND(SUM(issue_size) / 10000000, 2) AS value
      FROM master_issuer
      INNER JOIN master_business_sector 
        ON master_issuer.business_sector = master_business_sector.code
      INNER JOIN issuer_trustee 
        ON master_issuer.id = issuer_trustee.issuer_id
      WHERE allotment_date BETWEEN '${lessYear}-04-01 00:00:00' and '${greaterYear}-03-31 23:59:59'
        AND issuer_trustee.trustee_id IN (5,14,8,6,41,9,24,22,38,23)
      GROUP BY issuer_trustee.trustee_id, master_issuer.business_sector
    `);

    const finalResult = result?.map((item, index) => {
      return {
        rank: item?.cy_arr_rank || null,
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || null,
        currentDeals: item?.cy_issues || null,
        currentMarketShare: item?.cy_mkt_share || null,
        previousRank: Number(item?.py_arr_rank) || null,
        previousSize: item?.py_issue_size || null,
        previousDeals: Number(item?.py_issues) || null,
        previousMarketShare: item?.py_mkt_share || null,
        yoyChange: item?.yoy || null,
        id: item?.id || index,
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trusteePage_trustee_data', message: error.message });
  }
});

app.post('/trusteePage_agency_rating_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalRatings = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;

      `)


    const result = await prisma.$queryRawUnsafe(`
         select 
         master_agency.short_name as label, 
         ROUND((COUNT(master_issuer_rating.rating)/(${totalRatings[0]?.aggregate || 1}) * 100) ,2) as percentage, 
         COUNT(master_issuer_rating.id) as rating_no ,
         concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
         master_issuer_rating.rating 
         from master_agency 
         inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
         left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
         inner join issuer_trustee on issuer_trustee.issuer_id = i.id 
         where i.allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
         group by master_issuer_rating.rating;
      `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency rating', message: error.message });
  }
});

app.post('/trustee_specific_entity_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, trusteeId } = req.body;

    const sectorQuery = `
      SELECT 
          b.description AS business_name, 
          COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issue_size, 
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color ,
          COUNT(isin) AS no_of_issue
      FROM master_issuer 
      INNER JOIN master_business_sector AS b ON b.code = master_issuer.business_sector 
      INNER JOIN issuer_trustee ON issuer_trustee.issuer_id = master_issuer.id 
      WHERE allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
          AND business_sector IS NOT NULL 
          AND issuer_trustee.trustee_id = ${trusteeId} 
      GROUP BY master_issuer.business_sector 
      ORDER BY issue_size DESC 
      LIMIT 10
    `;
    const monthQuery = `
      select
      MONTH(master_issuer.allotment_date) as issue_month_no,
      MONTH(master_issuer.allotment_date) as allotment_month, 
      a.month_name as issue_month,
      ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS issue_size,
      SUM(master_issuer.issue_size) AS actual_issue_size,
      COUNT(master_issuer.isin) AS no_of_issue
      from master_issuer
      join all_months as a on a.month_no = MONTH(master_issuer.allotment_date)
      join issuer_trustee on issuer_trustee.issuer_id = master_issuer.id
      where master_issuer.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
      and issuer_trustee.trustee_id = ${trusteeId}
      group by allotment_month
      order by a.id asc
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating;
    `)
    const creditRatingQuery = `
      select master_agency.short_name as label, 
          ROUND((COUNT(master_issuer_rating.rating) / (${totalRatingNo[0]?.aggregate || 1}) * 100), 2) as percentage, 
          COUNT(master_issuer_rating.id) as rating_no,
          concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
          master_issuer_rating.rating as name
      from master_agency 
      inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      inner join issuer_trustee on issuer_trustee.issuer_id = i.id 
      where i.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
        and issuer_trustee.trustee_id = ${trusteeId} 
      group by master_issuer_rating.agency_id
    `;

    const trusteeDetailQuery = `
      select * from master_trustee where id = ${trusteeId}
    `;

    const [sectorData, monthData, creditRatingData, trusteeDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(trusteeDetailQuery)
    ]);

    res.status(200).json({ sectorData, monthData, creditRatingData, trusteeDetailsData });
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});


//ratig agencies

app.post('/agencyPage_agency_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      `)
    const result = await prisma.$queryRawUnsafe(`
        SELECT
        table1.id AS id,
        table1.issuer_name AS issuer_name,
        table1.no_issues AS cy_issues,
        table1.issue_size AS cy_issue_size,
        table1.arr_rank AS cy_arr_rank,
        table2.no_issues AS py_issues,
        table2.issue_size AS py_issue_size,
        table2.arr_rank AS py_arr_rank,
        ROUND( (table1.issue_size /  ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
        ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
        (
        case
        when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
        else
        ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
        end
        ) as yoy
        FROM
        (select
        master_agency.id,master_agency.short_name as issuer_name,count(isin) as no_issues,
        ROUND(SUM(issue_size) / 10000000,2) as issue_size,
        RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
        join issuer_details on issuer_details.id=master_issuer.issuer_master_id
        join master_issuer_rating on master_issuer_rating.issuer_id = master_issuer.id
        join master_agency on master_agency.id = master_issuer_rating.agency_id
        where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
        group by master_issuer_rating.agency_id
        order by arr_rank
        limit 10
        ) as table1
        left JOIN
        (select
        master_agency.id,master_agency.short_name as issuer_name,count(isin) as no_issues,
        ROUND(SUM(issue_size) / 10000000,2) as issue_size,
        RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
        join issuer_details on issuer_details.id=master_issuer.issuer_master_id
        join master_issuer_rating on master_issuer_rating.issuer_id = master_issuer.id
        join master_agency on master_agency.id = master_issuer_rating.agency_id
        where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
        group by master_issuer_rating.agency_id) as table2
        on table1.id=table2.id
        order by table1.arr_rank asc;
      `);



    const finalResult = result?.map((item, index) => {
      return {
        rank: item?.cy_arr_rank || null,
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || null,
        currentDeals: item?.cy_issues || null,
        currentMarketShare: item?.cy_mkt_share || null,
        previousRank: Number(item?.py_arr_rank) || null,
        previousSize: item?.py_issue_size || null,
        previousDeals: Number(item?.py_issues) || null,
        previousMarketShare: item?.py_mkt_share || null,
        yoyChange: item?.yoy || null,
        id: item?.id || index,
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agencyPage_agency_data', message: error.message });
  }
});

app.post('/agencyPage_rating_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalRatings = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;

      `)


    const result = await prisma.$queryRawUnsafe(`
         select 
         master_agency.short_name as label, 
         ROUND((COUNT(master_issuer_rating.rating)/(${totalRatings[0]?.aggregate || 1}) * 100) ,2) as percentage, 
         COUNT(master_issuer_rating.id) as rating_no ,
         concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
         master_issuer_rating.rating 
         from master_agency 
         inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
         left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
         where i.allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
         group by master_issuer_rating.rating
      `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agencyPage rating', message: error.message });
  }
});

app.post('/agencyPage_debt_redemption__data', async (req, res) => {
  try {
    const { lessYear, monthName } = req.body;

    const month = {
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'May': '05',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12'
    };
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        master_agency.short_name AS name,
        master_issuer.maturity_date AS maturity_date,
        COALESCE(ROUND(SUM(master_issuer.issue_size) / 10000000), 0) AS issue_size
        FROM master_issuer
        JOIN issuer_details 
            ON issuer_details.id=master_issuer.issuer_master_id
        JOIN master_issuer_rating 
            ON master_issuer_rating.issuer_id = master_issuer.id
        JOIN master_agency 
            ON master_agency.id = master_issuer_rating.agency_id
        WHERE master_issuer.maturity_date BETWEEN '${lessYear}-${month[`${monthName}`]}-01 00:00:00' 
                                          AND '${lessYear}-${month[`${monthName}`]}-31 23:59:59'
        GROUP BY master_agency.short_name, master_issuer.maturity_date
        ORDER BY issue_size DESC
        LIMIT 10;

    `);




    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agencyPage debt redemption data', message: error.message });
  }
});

app.post('/agencyPage_detailed_data', async (req, res) => {
  const {
    startDate = '2025-01-01',
    endDate = '2026-01-01',
    limit = 50,
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
    isin = ""
  } = req.body;
  try {
    const result = await prisma.$queryRawUnsafe(`
        select 
              master_issuer.id,
              master_issuer.isin,
              master_issuer.security_name,
              master_issuer.issue_size,
              master_issuer.face_value,
              master_issuer.allotment_date,
              master_issuer.maturity_date, 
              master_trustee.short_name AS debenture_trustee,
              master_arranger.short_name AS Arranger,
              master_issuer_ownership_type.description AS ownership_type,
              master_issuer_type_nature.description AS nature,
              master_business_sector.description AS sector,
              issuer_details.issuer_name AS issuer_name,
              master_security_type.description AS security_type,
              master_mode_issue.description AS mode_of_issue,
              issuer_coupon_details.coupon_rate,
              master_issuer_rating.rating AS credit_rating,
              listing_data.listing_status AS listing_status,
              listing_data.listing_status_code AS listing_status_code,
              master_agency.short_name AS credit_rating_agency,
              master_registrar.registrar_name AS Registrar,
              master_seniority_tier_classification.description AS Seniority,
              master_tax_free.description AS tax_free,
              master_secured_flag.description AS secured_flag
        from master_issuer 
        LEFT JOIN (
              SELECT 
              mise.issuer_id, 
              mls.description AS listing_status, 
              mise.listing_status AS listing_status_code
              FROM master_issuer_stock_exchange mise
              LEFT JOIN master_listing_status mls 
              ON mls.code = mise.listing_status
              WHERE mise.listing_status IS NOT NULL
              GROUP BY mise.issuer_id, mls.description, mise.listing_status
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
              ON master_issuer.id = master_issuer_rating.issuer_id
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
        where exists 
        (select * from master_issuer_rating where master_issuer.id = master_issuer_rating.issuer_id
        ) 
        and master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}' 
        ${issuerName ? `AND issuer_details.issuer_name LIKE '${issuerName}'` : ''}
        ${rating ? `AND master_issuer_rating.rating = '${rating}'` : ''}
        ${dealSize ? `AND master_issuer.issue_size LIKE '${dealSize}'` : ''}
        ${listingStatus ? `AND listing_data.listing_status = '${listingStatus}'` : ''}
        ${seniority ? `AND master_seniority_tier_classification.description = '${seniority}'` : ''}
        ${taxFree ? `AND master_tax_free.description = '${taxFree}'` : ''}
        ${securedFlag ? `AND master_secured_flag.description = '${securedFlag}'` : ''}
        ${sector ? `AND master_business_sector.description = '${sector}'` : ''}
        ${trustee ? `AND master_trustee.short_name LIKE '${trustee}'` : ''}
        ${nature ? `AND master_issuer_type_nature.description = '${nature}'` : ''}
        ${ownershipType ? `AND master_issuer_ownership_type.description = '${ownershipType}'` : ''}
        ${creditRatingAgency ? `AND master_agency.short_name = '${creditRatingAgency}'` : ''}
        ${isin ? `AND master_issuer.isin LIKE '${isin}'` : ''}
        ${arranger ? `AND master_arranger.short_name LIKE '${arranger}'` : ''}
        order by master_issuer.allotment_date asc 
        LIMIT ${limit} OFFSET ${offset};
     `);


    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size || '-',
        faceValue: item?.face_value || '-',
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
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch detailed agencyPage data', message: error.message });
  }

});

app.post('/agency_specific_entity_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, agencyId } = req.body;

    const sectorQuery = `
      SELECT 
          b.description AS business_name, 
          COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issue_size, 
          CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color ,
          COUNT(isin) AS no_of_issue
      FROM 
          master_issuer 
          INNER JOIN master_business_sector AS b ON b.code = master_issuer.business_sector 
          INNER JOIN master_issuer_rating ON master_issuer_rating.issuer_id = master_issuer.id 
      WHERE 
          allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
          AND business_sector IS NOT NULL 
          AND master_issuer_rating.agency_id = ${agencyId}  
      GROUP BY 
          master_issuer.business_sector 
      ORDER BY 
          issue_size DESC 
      LIMIT 10;
    `;
    const monthQuery = `
      select
      MONTH(master_issuer.allotment_date) as issue_month_no,
      MONTH(master_issuer.allotment_date) as allotment_month, 
      a.month_name as issue_month,
      ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS issue_size,
      SUM(master_issuer.issue_size) AS actual_issue_size,
      COUNT(master_issuer.isin) AS no_of_issue
      from master_issuer
      join all_months as a on a.month_no = MONTH(master_issuer.allotment_date)
      join master_issuer_rating on master_issuer_rating.issuer_id=master_issuer.id
      where master_issuer.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
      and master_issuer_rating.agency_id = ${agencyId}
      group by allotment_month
      order by a.id asc
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating;
    `)
    const creditRatingQuery = `
      select master_agency.short_name as label, 
          ROUND((COUNT(master_issuer_rating.rating) / (${totalRatingNo[0]?.aggregate || 1}) * 100), 2) as percentage, 
          COUNT(master_issuer_rating.id) as rating_no,
          concat('#', SUBSTRING((lpad(hex(round(rand() * 10000000)), 6, 0)), -6)) as color,
          master_issuer_rating.rating  as name
      from master_agency 
      inner join master_issuer_rating 
          on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i 
          on i.id = master_issuer_rating.issuer_id 
      where i.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'  
        and master_issuer_rating.agency_id = ${agencyId} 
      group by master_issuer_rating.rating
    `;

    const agencyDetailQuery = `
      select * from master_agency where id = ${agencyId}
    `;

    const [sectorData, monthData, creditRatingData, agencyDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(agencyDetailQuery)
    ]);

    res.status(200).json({ sectorData, monthData, creditRatingData, agencyDetailsData });
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});

//registrar page

app.post('/registrarPage_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalIssueSize = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      `)

    const totalIssueSizePrevYear = await prisma.$queryRawUnsafe(`
        select sum(issue_size) as aggregate from master_issuer where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
      `)
    const result = await prisma.$queryRawUnsafe(`
        SELECT
          table1.id AS id,
          table1.issuer_name AS issuer_name,
          table1.no_issues AS cy_issues,
          table1.issue_size AS cy_issue_size,
          table1.arr_rank AS cy_arr_rank,
          table2.no_issues AS py_issues,
          table2.issue_size AS py_issue_size,
          table2.arr_rank AS py_arr_rank,
          ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate / 10000000 || 1}) * 100 ,2) as cy_mkt_share,
          ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate / 10000000 || 1}) * 100 ,2) as py_mkt_share,
          (
          case
          when (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0)) = 0 then 0
          else
          ROUND( ((IFNULL(table1.issue_size,0)-IFNULL(table2.issue_size,0)) / (IFNULL(table1.issue_size,0)+IFNULL(table2.issue_size,0))) * 100 ,2)
          end
          ) as yoy
        FROM
          (select
          master_registrar.id,master_registrar.short_name as issuer_name,count(isin) as no_issues,
          ROUND(SUM(issue_size) / 10000000,2) as issue_size,
          RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
          join issuer_details on issuer_details.id=master_issuer.issuer_master_id
          join issuer_registrar on issuer_registrar.issuer_id = master_issuer.id
          join master_registrar on master_registrar.id = issuer_registrar.registrar_id
        where allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
        group by issuer_registrar.registrar_id
        order by arr_rank
        limit 10
          ) as table1
        left JOIN
          (select
          master_registrar.id,master_registrar.short_name as issuer_name,count(isin) as no_issues,
          ROUND(SUM(issue_size) / 10000000,2) as issue_size,
          RANK() OVER ( ORDER BY ROUND(SUM(issue_size) / 10000000,2) DESC ,count(isin) DESC ) as arr_rank
        from master_issuer
          join issuer_details on issuer_details.id=master_issuer.issuer_master_id
          join issuer_registrar on issuer_registrar.issuer_id = master_issuer.id
          join master_registrar on master_registrar.id = issuer_registrar.registrar_id
        where allotment_date between '${Number(lessYear) - 1}-04-01 00:00:00' and '${lessYearDate} 23:59:59'
        group by issuer_registrar.registrar_id) as table2
        on table1.id=table2.id
        order by table1.arr_rank asc;
      `);



    const finalResult = result?.map((item, index) => {
      return {
        rank: item?.cy_arr_rank || null,
        name: item?.issuer_name || '-',
        currentSize: item?.cy_issue_size || null,
        currentDeals: item?.cy_issues || null,
        currentMarketShare: item?.cy_mkt_share || null,
        previousRank: Number(item?.py_arr_rank) || null,
        previousSize: item?.py_issue_size || null,
        previousDeals: Number(item?.py_issues) || null,
        previousMarketShare: item?.py_mkt_share || null,
        yoyChange: item?.yoy || null,
        id: item?.id || index,
      }
    })

    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agencyPage_agency_data', message: error.message });
  }
});

app.post('/registrarPage_debt_redemption__data', async (req, res) => {
  try {
    const { lessYear, monthName } = req.body;

    const month = {
      'Jan': '01',
      'Feb': '02',
      'Mar': '03',
      'Apr': '04',
      'May': '05',
      'Jun': '06',
      'Jul': '07',
      'Aug': '08',
      'Sep': '09',
      'Oct': '10',
      'Nov': '11',
      'Dec': '12'
    };
    const result = await prisma.$queryRawUnsafe(`
      SELECT 
        master_registrar.short_name AS name,
        master_issuer.maturity_date AS maturity_date,
        COALESCE(ROUND(SUM(master_issuer.issue_size) / 10000000), 0) AS issue_size
        FROM master_issuer
        JOIN issuer_details 
            ON issuer_details.id=master_issuer.issuer_master_id
        JOIN issuer_registrar 
            ON issuer_registrar.issuer_id = master_issuer.id
        JOIN master_registrar 
            ON master_registrar.id = issuer_registrar.registrar_id
        WHERE master_issuer.maturity_date BETWEEN '${lessYear}-${month[`${monthName}`]}-01 00:00:00' 
                                          AND '${lessYear}-${month[`${monthName}`]}-31 23:59:59'
        GROUP BY master_registrar.short_name, master_issuer.maturity_date
        ORDER BY issue_size DESC
        LIMIT 10;

    `);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch registrarPage debt redemption data', message: error.message });
  }
});

app.post('/registrarPage_rating_data', async (req, res) => {
  try {
    const { greaterYear, lessYear, frequency } = req.body;
    const greaterDate = getDate(frequency, lessYear);
    const lessYearDate = getPreviousYear(greaterDate);

    const totalRatings = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;

      `)


    const result = await prisma.$queryRawUnsafe(`
         select 
          master_agency.short_name as label, 
          ROUND((COUNT(master_issuer_rating.rating)/(${totalRatings[0]?.aggregate || 1}) * 100) ,2) as percentage, 
          COUNT(master_issuer_rating.id) as rating_no ,
          concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
          master_issuer_rating.rating 
        from master_agency 
          inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
          left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
          inner join issuer_registrar on issuer_registrar.issuer_id = i.id 
        where i.allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59' 
        group by master_issuer_rating.rating
      `);

    const finalResult = result?.map((item) => {
      return {
        name: item?.rating || '-',
        percentage: Number(item?.percentage) || 0,
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch registrarPage rating', message: error.message });
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
    isin = ""
  } = req.body;
  try {
    const result = await prisma.$queryRawUnsafe(`
        select 
              master_issuer.id,
              master_issuer.isin,
              master_issuer.security_name,
              master_issuer.issue_size,
              master_issuer.face_value,
              master_issuer.allotment_date,
              master_issuer.maturity_date, 
              master_trustee.short_name AS debenture_trustee,
              master_arranger.short_name AS Arranger,
              master_issuer_ownership_type.description AS ownership_type,
              master_issuer_type_nature.description AS nature,
              master_business_sector.description AS sector,
              issuer_details.issuer_name AS issuer_name,
              master_security_type.description AS security_type,
              master_mode_issue.description AS mode_of_issue,
              issuer_coupon_details.coupon_rate,
              master_issuer_rating.rating AS credit_rating,
              listing_data.listing_status AS listing_status,
              listing_data.listing_status_code AS listing_status_code,
              master_agency.short_name AS credit_rating_agency,
              master_registrar.registrar_name AS Registrar,
              master_seniority_tier_classification.description AS Seniority,
              master_tax_free.description AS tax_free,
              master_secured_flag.description AS secured_flag
        from master_issuer 
        LEFT JOIN (
              SELECT 
              mise.issuer_id, 
              mls.description AS listing_status, 
              mise.listing_status AS listing_status_code
              FROM master_issuer_stock_exchange mise
              LEFT JOIN master_listing_status mls 
              ON mls.code = mise.listing_status
              WHERE mise.listing_status IS NOT NULL
              GROUP BY mise.issuer_id, mls.description, mise.listing_status
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
              ON master_issuer.id = issuer_registrar.issuer_id
        LEFT JOIN master_registrar 
              ON master_registrar.id = issuer_registrar.registrar_id
        LEFT JOIN master_seniority_tier_classification 
              ON master_seniority_tier_classification.code = master_issuer.seniority
        LEFT JOIN master_tax_free 
              ON master_tax_free.code = master_issuer.tax_free
        LEFT JOIN master_secured_flag 
              ON master_secured_flag.code = master_issuer.secured_flag
        where exists 
        (select * from issuer_registrar where master_issuer.id = issuer_registrar.issuer_id
        )
        and master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}' 
        ${issuerName ? `AND issuer_details.issuer_name LIKE '${issuerName}'` : ''}
        ${rating ? `AND master_issuer_rating.rating = '${rating}'` : ''}
        ${dealSize ? `AND master_issuer.issue_size LIKE '${dealSize}'` : ''}
        ${listingStatus ? `AND listing_data.listing_status = '${listingStatus}'` : ''}
        ${seniority ? `AND master_seniority_tier_classification.description = '${seniority}'` : ''}
        ${taxFree ? `AND master_tax_free.description = '${taxFree}'` : ''}
        ${securedFlag ? `AND master_secured_flag.description = '${securedFlag}'` : ''}
        ${sector ? `AND master_business_sector.description = '${sector}'` : ''}
        ${trustee ? `AND master_trustee.short_name LIKE '${trustee}'` : ''}
        ${nature ? `AND master_issuer_type_nature.description = '${nature}'` : ''}
        ${ownershipType ? `AND master_issuer_ownership_type.description = '${ownershipType}'` : ''}
        ${creditRatingAgency ? `AND master_agency.short_name = '${creditRatingAgency}'` : ''}
        ${isin ? `AND master_issuer.isin LIKE '${isin}'` : ''}
        ${arranger ? `AND master_arranger.short_name LIKE '${arranger}'` : ''}
        ${registrar ? `AND master_registrar.registrar_name LIKE '${registrar}'` : ''}
        order by master_issuer.allotment_date asc 
        LIMIT ${limit} OFFSET ${offset};
     `);


    const finalResult = result?.map((item) => {

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return {
        id: item?.id || '-',
        issuerName: item?.issuer_name || '-',
        isin: item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType: item?.security_type || '-',
        modeOfIssue: item?.mode_of_issue || '-',
        issueSize: item?.issue_size || '-',
        faceValue: item?.face_value || '-',
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
      }
    })


    res.status(200).json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch detailed agencyPage data', message: error.message });
  }

});

app.post('/registrar_specific_entity_details', async (req, res) => {
  try {
    const { greaterYear, lessYear, registrarId } = req.body;

    const sectorQuery = `
      SELECT 
          b.description AS business_name,
          COALESCE((ROUND(SUM(issue_size)/10000000)),0) AS issue_size,
          CONCAT("#", SUBSTRING((LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)), -6)) AS color,
          COUNT(isin) AS no_of_issue
      FROM master_issuer
      INNER JOIN master_business_sector AS b ON b.code = master_issuer.business_sector
      INNER JOIN issuer_registrar ON issuer_registrar.issuer_id = master_issuer.id
      WHERE allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
        AND business_sector IS NOT NULL
        AND issuer_registrar.registrar_id = ${registrarId} 
      GROUP BY master_issuer.business_sector
      ORDER BY issue_size DESC
      LIMIT 10
    `;
    const monthQuery = `
      select
      MONTH(master_issuer.allotment_date) as issue_month_no,
      MONTH(master_issuer.allotment_date) as allotment_month, 
      a.month_name as issue_month,
      ROUND(SUM(master_issuer.issue_size) / 10000000, 2) AS issue_size,
      SUM(master_issuer.issue_size) AS actual_issue_size,
      COUNT(master_issuer.isin) AS no_of_issue
      from master_issuer
      join all_months as a on a.month_no = MONTH(master_issuer.allotment_date)
      join issuer_registrar on issuer_registrar.issuer_id = master_issuer.id
      where master_issuer.allotment_date between '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
      and issuer_registrar.registrar_id = ${registrarId}
      group by allotment_month
      order by a.id asc
    `;

    const totalRatingNo = await prisma.$queryRawUnsafe(`
      select count(*) as aggregate from master_issuer_rating;
    `)
    const creditRatingQuery = `
      SELECT master_agency.short_name AS label,
          ROUND((COUNT(master_issuer_rating.rating) / (${totalRatingNo[0]?.aggregate || 1}) * 100), 2) AS percentage,
          COUNT(master_issuer_rating.id) AS rating_no,
          CONCAT('#', SUBSTRING((LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0)), -6)) AS color,
          master_issuer_rating.rating as name
      FROM master_agency
      INNER JOIN master_issuer_rating ON master_issuer_rating.agency_id = master_agency.id
      LEFT JOIN master_issuer AS i ON i.id = master_issuer_rating.issuer_id
      INNER JOIN issuer_registrar ON issuer_registrar.issuer_id = i.id
      WHERE i.allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
        AND issuer_registrar.registrar_id = ${registrarId} 
      GROUP BY master_issuer_rating.agency_id
    `;

    const registrarDetailQuery = `
      select * from master_registrar where id = ${registrarId}
    `;

    const [sectorData, monthData, creditRatingData, registrarDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(registrarDetailQuery)
    ]);

    res.status(200).json({ sectorData, monthData, creditRatingData, registrarDetailsData });
  } catch (error) {
    res.json({ success: false, err: error.message })
  }
});


app.listen(4000, '127.0.0.1', () => {
  console.log('Server running on port 4000');
});