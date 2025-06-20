const express = require('express');
const prisma = require('./db/mysqlDB');
const app = express();
const cors = require('cors');
app.use(express.json());
app.use(cors());

BigInt.prototype.toJSON = function() {
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
          sector:issuerSector?.description || 'undefined'
        };
      }));
      res.json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch master_issuer',message:error.message });
    }
});


app.post('/dashboard_monthly_issue_size', async (req, res) => {
  try {
    const {year} = req.body;
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
        count: Number(row.no_of_issues ),
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
    const finalResult = await Promise.all(result.map(async(item)=>{
       const res = await prisma.master_business_sector.findUnique({
        where:{
          code:item.business_sector || 0
        },
        select:{
          description:true,
        },
       });
       return {
        id:item.business_sector || 0,
        name:res?.description || 'undefined',
        noIssuer: Number(item._count._all || 0),
        value: Number(item._sum.issue_size || 0),
       }
    }));
    
    res.json(finalResult);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch master_issuer_sectors',message:error.message });
  }
});




app.post('/test_api', async (req, res) => {
  try {
    const result = req.body;

   
    res.json({success:true,result});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch API',message:error.message });
  }
});



app.get('/issuersdetails', async (req, res) => {
    try {
      const issuerdetails = await prisma.issuer_details.findMany();
      res.json({success:true,issuerdetails});
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch issuer_details',message:error.message });
    }
});

app.get('/', async (req, res) => {
 
    res.json({success:true});
});







const getShortMonthName = (fullMonthName) => {
  return fullMonthName.slice(0, 3);
};

const getDate =(frequency,lessYear) => {
  if(frequency === 'Yearly'){
    return `${Number(lessYear) + 1}-03-31`;
  }
  if(frequency === 'Half-Yearly'){
    return `${Number(lessYear)}-09-30`;
  }
  if(frequency === 'Quarterly'){
    return `${Number(lessYear)}-07-31`;
  }
  else{
      return '';
  }
}

const getFilteredMonths = (frequencyType,monthRanges) => {
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

const getPreviousYear = (dateStr) =>{
  const date = new Date(dateStr);
  date.setFullYear(date.getFullYear() - 1);

  const lessYearDate = date.toISOString().split('T')[0];
  return lessYearDate;
}





//Dashboard APIs

app.post('/dashboard_table', async (req, res) => {
    try {
      const {greaterYear,lessYear} = req.body;
      const result = await prisma.$queryRawUnsafe(`
      SELECT 
        issuer_details.id, 
        issuer_name AS name, 
        COUNT(isin) AS noIssuer, 
        COALESCE(ROUND(SUM(issue_size) / 10000000), 0) AS issueSize ,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color
      FROM issuer_details 
      INNER JOIN master_issuer 
        ON master_issuer.issuer_master_id = issuer_details.id 
      WHERE allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
      GROUP BY issuer_details.id 
      ORDER BY SUM(issue_size) DESC 
      LIMIT 10;
    `);

    res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});

app.post('/dashboard_monthly_issue_details', async (req, res) => {
    try {
      const {greaterYear,lessYear} = req.body;
      const result = await prisma.$queryRawUnsafe(`
      SELECT all_months.month_no AS issue_month_no, 
      MONTHNAME(STR_TO_DATE(LPAD(all_months.month_no, 2, '0'), '%m')) AS issue_month, 
      CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color,
      COUNT(i.isin) AS no_of_issue, IF(SUM(i.issue_size) > 0, ROUND(SUM(i.issue_size) / 10000000, 2), 0) AS issue_size, 
      SUM(i.issue_size) AS actual_issue_size FROM all_months 
      INNER JOIN master_issuer AS i ON all_months.month_no = MONTH(i.allotment_date) AND i.allotment_date 
      BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59' 
      GROUP BY all_months.month_no 
      ORDER BY all_months.id 
      ASC;
    `);

    res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});

app.post('/dashboard_sector_issue_details', async (req, res) => {
    try {
      const {greaterYear,lessYear} = req.body;
      const result = await prisma.$queryRawUnsafe(`
      SELECT 
        b.description AS business_name,
        COALESCE((ROUND(SUM(issue_size) / 10000000)), 0) AS issue_size,
        CONCAT('#', SUBSTRING(LPAD(HEX(ROUND(RAND() * 10000000)), 6, 0), -6)) AS color,
        COUNT(isin) AS no_of_issue
      FROM 
        master_issuer
      INNER JOIN 
        master_business_sector AS b 
          ON b.code = master_issuer.business_sector
      WHERE 
        allotment_date BETWEEN '${lessYear}-04-01 00:00:00' AND '${greaterYear}-03-31 23:59:59'
        AND business_sector IS NOT NULL
      GROUP BY 
        master_issuer.business_sector
      ORDER BY 
        issue_size DESC
      LIMIT 10;

      `);

    res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});


app.post('/dashboard_specific_entity_details',async (req,res)=>{
  try {
    const {greaterYear,lessYear,issuerId} = req.body;

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

    const [sectorData, monthData, creditRatingData,issuerDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(issuerDetailQuery)
    ]);
    
    res.status(200).json({sectorData, monthData, creditRatingData, issuerDetailsData}); 
  } catch (error) {
    res.json({success:false,err:error.message})
  }
});





//issuerpage APIs
app.post('/issuePage_outstanding_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;

      const greaterDate = getDate(frequency,lessYear);

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

    
    const formattedData = filteredMonthRanges?.map(({ label })=>{
      const issue = issueData?.find(item => item?.label === label);
      const redemption = redemptionData?.find(item => item?.label === label);
      const outstanding = outstandingData?.find(item => item?.label === label);

      return {
        month:getShortMonthName(label) || label,
        issue:  issue?.issue_size || 0,
        redemption: redemption?.issue_size || 0,
        outstanding: outstanding?.outstanding || 0
      };
    })

   
    // Response
    res.status(200).json(formattedData);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});

app.post('/issuePage_issuer_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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
      ROUND( (table1.issue_size /  ${totalIssueSize[0]?.aggregate/10000000 || 1}) * 100 ,2) as cy_mkt_share,
      ROUND( (table2.issue_size /  ${totalIssueSizePrevYear[0]?.aggregate/10000000 || 1}) * 100 ,2) as py_mkt_share,
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

    const finalResult = result?.map((item)=>{
      return  { 
        id:item?.id || '-',
        rank: item?.cy_arr_rank || '-', 
        name: item?.issuer_name || '-', 
        currentSize: item?.cy_issue_size || '-', 
        currentDeals: item?.cy_issues || '-', 
        currentMarketShare: item?.cy_mkt_share || '-', 
        previousRank: item?.py_arr_rank || '-', 
        previousSize: item?.py_issue_size || '-', 
        previousDeals: item?.py_issues || '-', 
        previousMarketShare: item?.py_mkt_share || '-', 
        yoyChange: item?.yoy ||'-'}
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});

app.post('/issuePage_top_sectors_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.sector_name || '-', 
        value:item?.cy_issue_size || null,
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard_table',message:error.message });
    }
});

app.post('/issuePage_agency_rating_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
      const lessYearDate = getPreviousYear(greaterDate);

      const totalRatingNo = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;
      `)
      const result = await prisma.$queryRawUnsafe(`
      select 
      master_agency.short_name as label, 
      ROUND((COUNT(master_issuer_rating.rating)/(${totalRatingNo[0]?.aggregate || 1 }) * 100) ,2) as percentage, 
      COUNT(master_issuer_rating.id) as rating_no ,
      concat('#',SUBSTRING((lpad(hex(round(rand() * 10000000)),6,0)),-6)) as color,
      master_issuer_rating.rating from master_agency 
      inner join master_issuer_rating on master_issuer_rating.agency_id = master_agency.id 
      left join master_issuer as i on i.id = master_issuer_rating.issuer_id 
      where i.allotment_date between '${lessYear}-04-01 00:00:00' and '${greaterDate} 23:59:59'
      group by master_issuer_rating.agency_id
    `);

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.rating || '-', 
        percentage: Number(item?.percentage) || 0, 
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
    }
});

app.post('/issuePage_debt_redemption__data', async (req, res) => {
    try {
      const {lessYear,monthName} = req.body;

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
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
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
    registrar= "",
    arranger = "",
    seniority ="",
    taxFree = "",
    securedFlag = "",
    sector ="",
    trustee="",
    nature="",
    ownershipType="",
    creditRatingAgency="",
    dealSize="",
    listingStatus=""
    } = req.body;
    try {
      const result = await prisma.$queryRawUnsafe(`
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

        WHERE 
          master_issuer.allotment_date BETWEEN '${startDate}' AND '${endDate}'
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
        ORDER BY master_issuer.allotment_date ASC
        LIMIT ${limit} OFFSET ${offset};
     `);
    // let filterInputsValues ={ownershipType:[],nature:[],sector:[],securityType:[],modeOfIssue:[],creditRatingAgency:[],creditRating:[],seniority:[],securedFlag:[],listingStatus:[],taxFree:[]};
    // result?.forEach((item) => {
    //   const checkAndPush = (key, value) => {
    //     if (value !== null && value !== undefined && !filterInputsValues[key].includes(value)) {
    //       filterInputsValues[key].push(value);
    //     }
    //   };

    //   checkAndPush('ownershipType', item?.ownership_type);
    //   checkAndPush('nature', item?.nature);
    //   checkAndPush('sector', item?.sector);
    //   checkAndPush('securityType', item?.security_type);
    //   checkAndPush('modeOfIssue', item?.mode_of_issue);
    //   checkAndPush('creditRatingAgency', item?.credit_rating_agency);
    //   checkAndPush('creditRating', item?.credit_rating);
    //   checkAndPush('seniority', item?.Seniority);
    //   checkAndPush('securedFlag', item?.secured_flag);
    //   checkAndPush('listingStatus', item?.listing_status);
    //   checkAndPush('taxFree', item?.tax_free);
    // });


    const finalResult = result?.map((item)=>{

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return  { 
        id:item?.id || '-',
        issuerName: item?.issuer_name || '-', 
        isin:item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType:item?.security_type || '-',
        modeOfIssue:item?.mode_of_issue || '-',
        issueSize:item?.issue_size || null,
        faceValue:item?.face_value || null,
        allotmentDate:item?.allotment_date ? allotment : '-',
        maturityDate:item?.maturity_date ? maturity : '-',
        couponRate:item?.coupon_rate || '-',
        creditRatingAgency:item?.credit_rating_agency || '-',
        creditRating:item?.credit_rating || '-',
        debentureTrustee:item?.debenture_trustee || '-',
        registrar:item?.Registrar || '-',
        arranger:item?.Arranger || '-',
        seniority:item?.Seniority || '-',
        taxFree:item?.tax_free || '-',
        securedFlag:item?.secured_flag || '-',
        listingStatus:item?.listing_status || '-',
        nature:item?.nature || '-',
        ownershipType:item?.ownership_type || '-',
        sector:item?.sector || '-',
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed issuepage data',message:error.message });
    }

});

app.post('/issuepage_filterinputs_data', async (req, res) => {
    try {
       const {startDate = '2025-01-01',endDate = '2026-01-01'} = req.body;
      
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
      res.status(500).json({ error: 'Failed to issuepage_filterinputs_data',message:error.message });
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


      const [result,couponTypeData,tenureData,redemptionTypeData,masterIssuerAdditionalData] = await Promise.all([
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
      res.status(500).json({ error: 'Failed to fetch issuePage_specific_isin_detailed_data',message:error.message });
    }

});


//arranger page
app.post('/arrangerPage_arranger_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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
      ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate/10000000 || 1}) * 100 ,2) as cy_mkt_share,
      ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate/10000000 || 1}) * 100 ,2) as py_mkt_share,
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

    const finalResult = result?.map((item,index)=>{
      return  { 
        rank: item?.cy_arr_rank || null, 
        name: item?.issuer_name || '-', 
        currentSize: item?.cy_issue_size || null, 
        currentDeals: item?.cy_issues || null, 
        currentMarketShare: item?.cy_mkt_share || null, 
        previousRank: Number(item?.py_arr_rank) || null, 
        previousSize: item?.py_issue_size || null, 
        previousDeals: Number(item?.py_issues) || null, 
        previousMarketShare: item?.py_mkt_share || null, 
        yoyChange: item?.yoy ||null,
        id: item?.id || '-',
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
    }
});


app.post('/arrangerPage_sector_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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


    const finalResult = result?.map((item,index)=>{
      return  { 
        value: item?.value || null,
        name: item?.description || '-', 
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch arranger sector data',message:error.message });
    }
});

app.post('/arrangerPage_debt_redemption__data', async (req, res) => {
    try {
      const {lessYear,monthName} = req.body;

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
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
    }
});

app.post('/arrangerPage_agency_rating_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
      const lessYearDate = getPreviousYear(greaterDate);

      const totalRatingNo = await prisma.$queryRawUnsafe(`
        select count(*) as aggregate from master_issuer_rating;
      `)
      const result = await prisma.$queryRawUnsafe(`
      SELECT 
        master_agency.short_name AS label,
        ROUND((COUNT(master_issuer_rating.rating) / (${totalRatingNo[0]?.aggregate || 1 }) * 100), 2) AS percentage,
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

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.rating || '-', 
        percentage: Number(item?.percentage) || 0, 
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
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
    registrar= "",
    arranger = "",
    seniority ="",
    taxFree = "",
    securedFlag = "",
    sector ="",
    trustee="",
    nature="",
    ownershipType="",
    creditRatingAgency="",
    dealSize="",
    listingStatus="",
    isin=""
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
    

    const finalResult = result?.map((item)=>{

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return  { 
        id:item?.id || '-',
        issuerName: item?.issuer_name || '-', 
        isin:item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType:item?.security_type || '-',
        modeOfIssue:item?.mode_of_issue || '-',
        issueSize:item?.issue_size || null,
        faceValue:item?.face_value || null,
        allotmentDate:item?.allotment_date ? allotment : '-',
        maturityDate:item?.maturity_date ? maturity : '-',
        couponRate:item?.coupon_rate || '-',
        creditRatingAgency:item?.credit_rating_agency || '-',
        creditRating:item?.credit_rating || '-',
        debentureTrustee:item?.debenture_trustee || '-',
        registrar:item?.Registrar || '-',
        arranger:item?.Arranger || '-',
        seniority:item?.Seniority || '-',
        taxFree:item?.tax_free || '-',
        securedFlag:item?.secured_flag || '-',
        listingStatus:item?.listing_status || '-',
        nature:item?.nature || '-',
        ownershipType:item?.ownership_type || '-',
        sector:item?.sector || '-',
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed issuepage data',message:error.message });
    }

});

app.post('/arranger_specific_entity_details',async (req,res)=>{
  try {
    const {greaterYear,lessYear,arrangerId} = req.body;

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
      ROUND((COUNT(master_issuer_rating.rating)/(${totalRatingNo[0]?.aggregate || 1 }) * 100) ,2) as percentage, 
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

    const [sectorData, monthData, creditRatingData,arrangerDetailsData] = await Promise.all([
      prisma.$queryRawUnsafe(sectorQuery),
      prisma.$queryRawUnsafe(monthQuery),
      prisma.$queryRawUnsafe(creditRatingQuery),
      prisma.$queryRawUnsafe(arrangerDetailQuery)
    ]);

    res.status(200).json({sectorData, monthData, creditRatingData, arrangerDetailsData}); 
  } catch (error) {
    res.json({success:false,err:error.message})
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
    registrar= "",
    arranger = "",
    seniority ="",
    taxFree = "",
    securedFlag = "",
    sector ="",
    trustee="",
    nature="",
    ownershipType="",
    creditRatingAgency="",
    dealSize="",
    listingStatus="",
    isin=""
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
    

    const finalResult = result?.map((item)=>{

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return  { 
        id:item?.id || '-',
        issuerName: item?.issuer_name || '-', 
        isin:item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType:item?.security_type || '-',
        modeOfIssue:item?.mode_of_issue || '-',
        issueSize:item?.issue_size || '-',
        faceValue:item?.face_value || '-',
        allotmentDate:item?.allotment_date ? allotment : '-',
        maturityDate:item?.maturity_date ? maturity : '-',
        couponRate:item?.coupon_rate || '-',
        creditRatingAgency:item?.credit_rating_agency || '-',
        creditRating:item?.credit_rating || '-',
        debentureTrustee:item?.debenture_trustee || '-',
        registrar:item?.Registrar || '-',
        arranger:item?.Arranger || '-',
        seniority:item?.Seniority || '-',
        taxFree:item?.tax_free || '-',
        securedFlag:item?.secured_flag || '-',
        listingStatus:item?.listing_status || '-',
        nature:item?.nature || '-',
        ownershipType:item?.ownership_type || '-',
        sector:item?.sector || '-',
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed trusteepage data',message:error.message });
    }

});

app.post('/trusteePage_trustee_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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
        ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate/10000000 || 1}) * 100 ,2) as cy_mkt_share,
        ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate/10000000 || 1}) * 100 ,2) as py_mkt_share,
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

    const finalResult = result?.map((item,index)=>{
      return  { 
        rank: item?.cy_arr_rank || null, 
        name: item?.issuer_name || '-', 
        currentSize: item?.cy_issue_size || null, 
        currentDeals: item?.cy_issues || null, 
        currentMarketShare: item?.cy_mkt_share || null, 
        previousRank: Number(item?.py_arr_rank) || null, 
        previousSize: item?.py_issue_size || null, 
        previousDeals: Number(item?.py_issues) || null, 
        previousMarketShare: item?.py_mkt_share || null, 
        yoyChange: item?.yoy ||null,
        id: item?.id ||index,
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch trusteePage_trustee_data',message:error.message });
    }
});

app.post('/trusteePage_agency_rating_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.rating || '-', 
        percentage: Number(item?.percentage) || 0, 
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agency rating',message:error.message });
    }
});


//ratig agencies

app.post('/agencyPage_agency_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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
        ROUND( (table1.issue_size /  ${totalIssueSize[0]?.aggregate/10000000 || 1}) * 100 ,2) as cy_mkt_share,
        ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate/10000000 || 1}) * 100 ,2) as py_mkt_share,
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

    

    const finalResult = result?.map((item,index)=>{
      return  { 
        rank: item?.cy_arr_rank || null, 
        name: item?.issuer_name || '-', 
        currentSize: item?.cy_issue_size || null, 
        currentDeals: item?.cy_issues || null, 
        currentMarketShare: item?.cy_mkt_share || null, 
        previousRank: Number(item?.py_arr_rank) || null, 
        previousSize: item?.py_issue_size || null, 
        previousDeals: Number(item?.py_issues) || null, 
        previousMarketShare: item?.py_mkt_share || null, 
        yoyChange: item?.yoy ||null,
        id: item?.id ||index,
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agencyPage_agency_data',message:error.message });
    }
});

app.post('/agencyPage_rating_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.rating || '-', 
        percentage: Number(item?.percentage) || 0, 
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agencyPage rating',message:error.message });
    }
});

app.post('/agencyPage_debt_redemption__data', async (req, res) => {
    try {
      const {lessYear,monthName} = req.body;

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
      res.status(500).json({ error: 'Failed to fetch agencyPage debt redemption data',message:error.message });
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
    registrar= "",
    arranger = "",
    seniority ="",
    taxFree = "",
    securedFlag = "",
    sector ="",
    trustee="",
    nature="",
    ownershipType="",
    creditRatingAgency="",
    dealSize="",
    listingStatus="",
    isin=""
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
    

    const finalResult = result?.map((item)=>{

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return  { 
        id:item?.id || '-',
        issuerName: item?.issuer_name || '-', 
        isin:item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType:item?.security_type || '-',
        modeOfIssue:item?.mode_of_issue || '-',
        issueSize:item?.issue_size || '-',
        faceValue:item?.face_value || '-',
        allotmentDate:item?.allotment_date ? allotment : '-',
        maturityDate:item?.maturity_date ? maturity : '-',
        couponRate:item?.coupon_rate || '-',
        creditRatingAgency:item?.credit_rating_agency || '-',
        creditRating:item?.credit_rating || '-',
        debentureTrustee:item?.debenture_trustee || '-',
        registrar:item?.Registrar || '-',
        arranger:item?.Arranger || '-',
        seniority:item?.Seniority || '-',
        taxFree:item?.tax_free || '-',
        securedFlag:item?.secured_flag || '-',
        listingStatus:item?.listing_status || '-',
        nature:item?.nature || '-',
        ownershipType:item?.ownership_type || '-',
        sector:item?.sector || '-',
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed agencyPage data',message:error.message });
    }

});

//registrar page

app.post('/registrarPage_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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
          ROUND( (table1.issue_size / ${totalIssueSize[0]?.aggregate/10000000 || 1}) * 100 ,2) as cy_mkt_share,
          ROUND( (table2.issue_size / ${totalIssueSizePrevYear[0]?.aggregate/10000000 || 1}) * 100 ,2) as py_mkt_share,
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

    

    const finalResult = result?.map((item,index)=>{
      return  { 
        rank: item?.cy_arr_rank || null, 
        name: item?.issuer_name || '-', 
        currentSize: item?.cy_issue_size || null, 
        currentDeals: item?.cy_issues || null, 
        currentMarketShare: item?.cy_mkt_share || null, 
        previousRank: Number(item?.py_arr_rank) || null, 
        previousSize: item?.py_issue_size || null, 
        previousDeals: Number(item?.py_issues) || null, 
        previousMarketShare: item?.py_mkt_share || null, 
        yoyChange: item?.yoy ||null,
        id: item?.id ||index,
      }
    })

    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch agencyPage_agency_data',message:error.message });
    }
});

app.post('/registrarPage_debt_redemption__data', async (req, res) => {
    try {
      const {lessYear,monthName} = req.body;

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
      res.status(500).json({ error: 'Failed to fetch registrarPage debt redemption data',message:error.message });
    }
});

app.post('/registrarPage_rating_data', async (req, res) => {
    try {
      const {greaterYear,lessYear, frequency} = req.body;
      const greaterDate = getDate(frequency,lessYear);
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

    const finalResult = result?.map((item)=>{
      return  { 
        name: item?.rating || '-', 
        percentage: Number(item?.percentage) || 0, 
        rating_no: Number(item?.rating_no) || 0,
        color: item?.color || '-',
        label: item?.label || '-'
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch registrarPage rating',message:error.message });
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
    registrar= "",
    arranger = "",
    seniority ="",
    taxFree = "",
    securedFlag = "",
    sector ="",
    trustee="",
    nature="",
    ownershipType="",
    creditRatingAgency="",
    dealSize="",
    listingStatus="",
    isin=""
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
    

    const finalResult = result?.map((item)=>{

      const allotment = item?.allotment_date ? new Date(item?.allotment_date).toISOString().split('T')[0] : null;
      const maturity = item?.maturity_date ? new Date(item?.maturity_date).toISOString().split('T')[0] : null;
      return  { 
        id:item?.id || '-',
        issuerName: item?.issuer_name || '-', 
        isin:item?.isin || '-',
        securityName: item?.security_name || '-',
        securityType:item?.security_type || '-',
        modeOfIssue:item?.mode_of_issue || '-',
        issueSize:item?.issue_size || '-',
        faceValue:item?.face_value || '-',
        allotmentDate:item?.allotment_date ? allotment : '-',
        maturityDate:item?.maturity_date ? maturity : '-',
        couponRate:item?.coupon_rate || '-',
        creditRatingAgency:item?.credit_rating_agency || '-',
        creditRating:item?.credit_rating || '-',
        debentureTrustee:item?.debenture_trustee || '-',
        registrar:item?.Registrar || '-',
        arranger:item?.Arranger || '-',
        seniority:item?.Seniority || '-',
        taxFree:item?.tax_free || '-',
        securedFlag:item?.secured_flag || '-',
        listingStatus:item?.listing_status || '-',
        nature:item?.nature || '-',
        ownershipType:item?.ownership_type || '-',
        sector:item?.sector || '-',
      }
    })


    res.status(200).json(finalResult);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch detailed agencyPage data',message:error.message });
    }

});


PORT=4000;
app.listen(PORT,()=>{
    console.log(`server running on port ${PORT}`)
})  