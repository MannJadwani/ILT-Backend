
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 6.6.0
 * Query Engine version: f676762280b54cd07c770017ed3711ddde35f37a
 */
Prisma.prismaVersion = {
  client: "6.6.0",
  engine: "f676762280b54cd07c770017ed3711ddde35f37a"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.Admin_settingScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  is_active: 'is_active',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.All_monthsScalarFieldEnum = {
  id: 'id',
  month_no: 'month_no',
  month_name: 'month_name'
};

exports.Prisma.CacheScalarFieldEnum = {
  key: 'key',
  value: 'value',
  expiration: 'expiration'
};

exports.Prisma.Cache_locksScalarFieldEnum = {
  key: 'key',
  owner: 'owner',
  expiration: 'expiration'
};

exports.Prisma.Cron_statusScalarFieldEnum = {
  id: 'id',
  cron_name: 'cron_name',
  cron_date: 'cron_date',
  updated_at: 'updated_at'
};

exports.Prisma.Daily_issuer_cron_tableScalarFieldEnum = {
  id: 'id',
  isin: 'isin',
  allotment_date: 'allotment_date',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Failed_jobsScalarFieldEnum = {
  id: 'id',
  uuid: 'uuid',
  connection: 'connection',
  queue: 'queue',
  payload: 'payload',
  exception: 'exception',
  failed_at: 'failed_at'
};

exports.Prisma.Incorporatedate_cronScalarFieldEnum = {
  id: 'id',
  isin: 'isin',
  allotment_date: 'allotment_date',
  status: 'status',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Issuer_coupon_detailsScalarFieldEnum = {
  id: 'id',
  issuer_id: 'issuer_id',
  coupon_type: 'coupon_type',
  coupon_pay_date: 'coupon_pay_date',
  coupon_rate_date: 'coupon_rate_date',
  coupon_rate: 'coupon_rate',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Issuer_detailsScalarFieldEnum = {
  id: 'id',
  issuer_name: 'issuer_name',
  issuer_former_name: 'issuer_former_name',
  parent_id: 'parent_id',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Issuer_redemption_detailsScalarFieldEnum = {
  id: 'id',
  issuer_id: 'issuer_id',
  redmp_premimum_date: 'redmp_premimum_date',
  type_redmptn: 'type_redmptn',
  defaultinredmptn: 'defaultinredmptn',
  redmp_details: 'redmp_details',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Issuer_tenure_detailsScalarFieldEnum = {
  id: 'id',
  issuer_id: 'issuer_id',
  tenure: 'tenure',
  tenure_no_years: 'tenure_no_years',
  tenure_no_months: 'tenure_no_months',
  tenure_no_days: 'tenure_no_days',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.IssuersScalarFieldEnum = {
  id: 'id',
  name: 'name',
  some_metric: 'some_metric'
};

exports.Prisma.Job_batchesScalarFieldEnum = {
  id: 'id',
  name: 'name',
  total_jobs: 'total_jobs',
  pending_jobs: 'pending_jobs',
  failed_jobs: 'failed_jobs',
  failed_job_ids: 'failed_job_ids',
  options: 'options',
  cancelled_at: 'cancelled_at',
  created_at: 'created_at',
  finished_at: 'finished_at'
};

exports.Prisma.JobsScalarFieldEnum = {
  id: 'id',
  queue: 'queue',
  payload: 'payload',
  attempts: 'attempts',
  reserved_at: 'reserved_at',
  available_at: 'available_at',
  created_at: 'created_at'
};

exports.Prisma.Master_agencyScalarFieldEnum = {
  id: 'id',
  agency_code: 'agency_code',
  agency_name: 'agency_name',
  short_name: 'short_name',
  parent_id: 'parent_id',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_arrangerScalarFieldEnum = {
  id: 'id',
  arranger_name: 'arranger_name',
  short_name: 'short_name',
  website: 'website',
  smt_status: 'smt_status',
  parent_id: 'parent_id',
  created_by: 'created_by',
  created_at: 'created_at',
  updated_by: 'updated_by',
  updated_at: 'updated_at',
  is_active: 'is_active',
  is_deleted: 'is_deleted'
};

exports.Prisma.Master_booking_basisScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_businees_sector_v1ScalarFieldEnum = {
  id: 'id',
  category_code: 'category_code',
  category_name: 'category_name',
  category_type: 'category_type',
  parent_category: 'parent_category',
  system_category_code: 'system_category_code',
  description: 'description',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_by: 'created_by',
  updated_by: 'updated_by',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_business_sectorScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_call_option_detailsScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_contactScalarFieldEnum = {
  id: 'id',
  type: 'type',
  master_id: 'master_id',
  contact_person: 'contact_person',
  address: 'address',
  contact_no: 'contact_no',
  email_id: 'email_id',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_convertible_type_aScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_convertible_type_bScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_coupon_basisScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_coupon_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_craScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_cra_statusScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_credit_rating_watchScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_day_countScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_depository_indicatorScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_exchange_bp_idScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_frequencyScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_guaranteed_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_interest_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuerScalarFieldEnum = {
  id: 'id',
  issuer_master_id: 'issuer_master_id',
  isin: 'isin',
  security_class: 'security_class',
  security_name: 'security_name',
  series: 'series',
  allotment_date: 'allotment_date',
  face_value: 'face_value',
  maturity_date: 'maturity_date',
  convertible_flag: 'convertible_flag',
  option_flag: 'option_flag',
  tier_classification: 'tier_classification',
  day_count: 'day_count',
  seniority: 'seniority',
  secured_flag: 'secured_flag',
  compound_frequency: 'compound_frequency',
  call_desc: 'call_desc',
  put_desc: 'put_desc',
  rated_flag: 'rated_flag',
  isin_desc: 'isin_desc',
  convertible_type_a: 'convertible_type_a',
  convertible_type_b: 'convertible_type_b',
  convertible_details: 'convertible_details',
  stipulation_details: 'stipulation_details',
  issue_size: 'issue_size',
  guaranteed_type: 'guaranteed_type',
  guaranteed: 'guaranteed',
  tax_free: 'tax_free',
  if_taxable: 'if_taxable',
  mode_issue: 'mode_issue',
  security_status: 'security_status',
  allotment_qty: 'allotment_qty',
  stepupdwnbasis: 'stepupdwnbasis',
  stepupdwndtls: 'stepupdwndtls',
  issuer_ownership_type: 'issuer_ownership_type',
  nature_type: 'nature_type',
  business_sector: 'business_sector',
  perpetual_nature: 'perpetual_nature',
  call_option: 'call_option',
  put_option: 'put_option',
  infra_category: 'infra_category',
  issue_price: 'issue_price',
  interest_type: 'interest_type',
  fintrpydte: 'fintrpydte',
  freq: 'freq',
  freq_dis: 'freq_dis',
  next_sch_date: 'next_sch_date',
  intratupto: 'intratupto',
  intratlkto: 'intratlkto',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  is_updated: 'is_updated',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_additionalScalarFieldEnum = {
  id: 'id',
  issuer_id: 'issuer_id',
  cin: 'cin',
  macro: 'macro',
  sector: 'sector',
  industry: 'industry',
  basicIndustry: 'basicIndustry',
  amountRaised: 'amountRaised',
  greenShoeOption: 'greenShoeOption',
  redemptionDate: 'redemptionDate',
  category: 'category',
  trancheNumber: 'trancheNumber',
  natureOfInstrument: 'natureOfInstrument',
  objectOfIssue: 'objectOfIssue',
  scheduledOpeningDate: 'scheduledOpeningDate',
  scheduledClosingDate: 'scheduledClosingDate',
  actualClosingDate: 'actualClosingDate',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_dailyScalarFieldEnum = {
  id: 'id',
  issuer_master_id: 'issuer_master_id',
  isin: 'isin',
  security_class: 'security_class',
  security_name: 'security_name',
  series: 'series',
  allotment_date: 'allotment_date',
  face_value: 'face_value',
  maturity_date: 'maturity_date',
  convertible_flag: 'convertible_flag',
  option_flag: 'option_flag',
  tier_classification: 'tier_classification',
  day_count: 'day_count',
  seniority: 'seniority',
  secured_flag: 'secured_flag',
  compound_frequency: 'compound_frequency',
  call_desc: 'call_desc',
  put_desc: 'put_desc',
  rated_flag: 'rated_flag',
  isin_desc: 'isin_desc',
  convertible_type_a: 'convertible_type_a',
  convertible_type_b: 'convertible_type_b',
  convertible_details: 'convertible_details',
  debenture_trustee_name: 'debenture_trustee_name',
  stipulation_details: 'stipulation_details',
  issue_size: 'issue_size',
  guaranteed_type: 'guaranteed_type',
  guaranteed: 'guaranteed',
  tax_free: 'tax_free',
  if_taxable: 'if_taxable',
  mode_issue: 'mode_issue',
  security_status: 'security_status',
  allotment_qty: 'allotment_qty',
  stepupdwnbasis: 'stepupdwnbasis',
  stepupdwndtls: 'stepupdwndtls',
  issuer_ownership_type: 'issuer_ownership_type',
  nature_type: 'nature_type',
  business_sector: 'business_sector',
  perpetual_nature: 'perpetual_nature',
  call_option: 'call_option',
  put_option: 'put_option',
  infra_category: 'infra_category',
  issue_price: 'issue_price',
  interest_type: 'interest_type',
  fintrpydte: 'fintrpydte',
  freq: 'freq',
  freq_dis: 'freq_dis',
  next_sch_date: 'next_sch_date',
  intratupto: 'intratupto',
  intratlkto: 'intratlkto',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_ownership_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_ratingScalarFieldEnum = {
  id: 'id',
  agency_id: 'agency_id',
  issuer_id: 'issuer_id',
  rating: 'rating',
  outlook: 'outlook',
  watch: 'watch',
  rating_date: 'rating_date',
  ratingAction: 'ratingAction',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_stock_exchangeScalarFieldEnum = {
  id: 'id',
  issuer_id: 'issuer_id',
  stock_exchange: 'stock_exchange',
  listing_status: 'listing_status',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_type_natureScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_issuer_type_rolesScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_law_firmScalarFieldEnum = {
  id: 'id',
  law_firm_name: 'law_firm_name',
  partner_name: 'partner_name',
  revenue: 'revenue',
  locations: 'locations',
  total_transaction: 'total_transaction',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_listing_statusScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_mode_issueScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_perpetual_nature_indicatorScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_put_option_detailsScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_redemption_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_registrarScalarFieldEnum = {
  id: 'id',
  registrar_name: 'registrar_name',
  short_name: 'short_name',
  website: 'website',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  parent_id: 'parent_id',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_secured_flagScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_security_statusScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_security_typeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_seniority_tier_classificationScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_step_up_down_coupon_basisScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_tax_freeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  description: 'description',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Master_trusteeScalarFieldEnum = {
  id: 'id',
  trustee_name: 'trustee_name',
  short_name: 'short_name',
  trustshpd: 'trustshpd',
  website: 'website',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  parent_id: 'parent_id',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.MigrationsScalarFieldEnum = {
  id: 'id',
  migration: 'migration',
  batch: 'batch'
};

exports.Prisma.Password_reset_tokensScalarFieldEnum = {
  email: 'email',
  token: 'token',
  created_at: 'created_at'
};

exports.Prisma.Personal_access_tokensScalarFieldEnum = {
  id: 'id',
  tokenable_type: 'tokenable_type',
  tokenable_id: 'tokenable_id',
  name: 'name',
  token: 'token',
  abilities: 'abilities',
  last_used_at: 'last_used_at',
  expires_at: 'expires_at',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Redis_cron_tableScalarFieldEnum = {
  id: 'id',
  fy: 'fy',
  dashboard_issuer: 'dashboard_issuer',
  dashboard_arranger: 'dashboard_arranger',
  dashboard_trustee: 'dashboard_trustee',
  dashboard_registrar: 'dashboard_registrar',
  dashboard_rating_agency: 'dashboard_rating_agency',
  heatmap_issuer: 'heatmap_issuer',
  heatmap_arranger: 'heatmap_arranger',
  heatmap_trustee: 'heatmap_trustee',
  heatmap_registrar: 'heatmap_registrar',
  top_issue_size_no_fy: 'top_issue_size_no_fy',
  top_issue_size_no_h2: 'top_issue_size_no_h2',
  top_issue_size_no_h1: 'top_issue_size_no_h1',
  top_issue_size_no_q4: 'top_issue_size_no_q4',
  top_issue_size_no_q3: 'top_issue_size_no_q3',
  top_issue_size_no_q2: 'top_issue_size_no_q2',
  top_issue_size_no_q1: 'top_issue_size_no_q1',
  top_issue_size_no_m3: 'top_issue_size_no_m3',
  top_issue_size_no_m2: 'top_issue_size_no_m2',
  top_issue_size_no_m1: 'top_issue_size_no_m1',
  top_issue_size_no_m12: 'top_issue_size_no_m12',
  top_issue_size_no_m11: 'top_issue_size_no_m11',
  top_issue_size_no_m10: 'top_issue_size_no_m10',
  top_issue_size_no_m9: 'top_issue_size_no_m9',
  top_issue_size_no_m8: 'top_issue_size_no_m8',
  top_issue_size_no_m7: 'top_issue_size_no_m7',
  top_issue_size_no_m6: 'top_issue_size_no_m6',
  top_issue_size_no_m5: 'top_issue_size_no_m5',
  top_issue_size_no_m4: 'top_issue_size_no_m4',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.Redis_iro_cron_tableScalarFieldEnum = {
  id: 'id',
  fy: 'fy',
  iro_fy: 'iro_fy',
  iro_h2: 'iro_h2',
  iro_h1: 'iro_h1',
  iro_q4: 'iro_q4',
  iro_q3: 'iro_q3',
  iro_q2: 'iro_q2',
  iro_q1: 'iro_q1',
  iro_m3: 'iro_m3',
  iro_m2: 'iro_m2',
  iro_m1: 'iro_m1',
  iro_m12: 'iro_m12',
  iro_m11: 'iro_m11',
  iro_m10: 'iro_m10',
  iro_m9: 'iro_m9',
  iro_m8: 'iro_m8',
  iro_m7: 'iro_m7',
  iro_m6: 'iro_m6',
  iro_m5: 'iro_m5',
  iro_m4: 'iro_m4',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.SessionsScalarFieldEnum = {
  id: 'id',
  user_id: 'user_id',
  ip_address: 'ip_address',
  user_agent: 'user_agent',
  payload: 'payload',
  last_activity: 'last_activity'
};

exports.Prisma.User_enquiryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  company_name: 'company_name',
  email: 'email',
  contact_number: 'contact_number',
  message: 'message',
  created_at: 'created_at',
  updated_at: 'updated_at'
};

exports.Prisma.UsersScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  password: 'password',
  mobile: 'mobile',
  company_name: 'company_name',
  user_type: 'user_type',
  role_id: 'role_id',
  email_verified_at: 'email_verified_at',
  date_registration: 'date_registration',
  last_login_ip: 'last_login_ip',
  last_login_date: 'last_login_date',
  otp_login: 'otp_login',
  otp_current_time: 'otp_current_time',
  device_token: 'device_token',
  remember_token: 'remember_token',
  created_by: 'created_by',
  updated_by: 'updated_by',
  is_active: 'is_active',
  is_deleted: 'is_deleted',
  created_at: 'created_at',
  updated_at: 'updated_at',
  firebase_uid: 'firebase_uid',
  login_type: 'login_type',
  designation: 'designation',
  utm_source: 'utm_source'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.admin_settingOrderByRelevanceFieldEnum = {
  name: 'name'
};

exports.Prisma.all_monthsOrderByRelevanceFieldEnum = {
  month_name: 'month_name'
};

exports.Prisma.cacheOrderByRelevanceFieldEnum = {
  key: 'key',
  value: 'value'
};

exports.Prisma.cache_locksOrderByRelevanceFieldEnum = {
  key: 'key',
  owner: 'owner'
};

exports.Prisma.cron_statusOrderByRelevanceFieldEnum = {
  cron_name: 'cron_name'
};

exports.Prisma.daily_issuer_cron_tableOrderByRelevanceFieldEnum = {
  isin: 'isin'
};

exports.Prisma.failed_jobsOrderByRelevanceFieldEnum = {
  uuid: 'uuid',
  connection: 'connection',
  queue: 'queue',
  payload: 'payload',
  exception: 'exception'
};

exports.Prisma.incorporatedate_cronOrderByRelevanceFieldEnum = {
  isin: 'isin'
};

exports.Prisma.issuer_coupon_detailsOrderByRelevanceFieldEnum = {
  coupon_type: 'coupon_type',
  coupon_pay_date: 'coupon_pay_date',
  coupon_rate_date: 'coupon_rate_date',
  coupon_rate: 'coupon_rate'
};

exports.Prisma.issuer_detailsOrderByRelevanceFieldEnum = {
  issuer_name: 'issuer_name',
  issuer_former_name: 'issuer_former_name'
};

exports.Prisma.issuer_redemption_detailsOrderByRelevanceFieldEnum = {
  redmp_premimum_date: 'redmp_premimum_date',
  defaultinredmptn: 'defaultinredmptn',
  redmp_details: 'redmp_details'
};

exports.Prisma.issuersOrderByRelevanceFieldEnum = {
  name: 'name'
};

exports.Prisma.job_batchesOrderByRelevanceFieldEnum = {
  id: 'id',
  name: 'name',
  failed_job_ids: 'failed_job_ids',
  options: 'options'
};

exports.Prisma.jobsOrderByRelevanceFieldEnum = {
  queue: 'queue',
  payload: 'payload'
};

exports.Prisma.master_agencyOrderByRelevanceFieldEnum = {
  agency_code: 'agency_code',
  agency_name: 'agency_name',
  short_name: 'short_name'
};

exports.Prisma.master_arrangerOrderByRelevanceFieldEnum = {
  arranger_name: 'arranger_name',
  short_name: 'short_name',
  website: 'website',
  smt_status: 'smt_status'
};

exports.Prisma.master_booking_basisOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_businees_sector_v1OrderByRelevanceFieldEnum = {
  category_code: 'category_code',
  category_name: 'category_name',
  category_type: 'category_type',
  parent_category: 'parent_category',
  system_category_code: 'system_category_code',
  description: 'description'
};

exports.Prisma.master_business_sectorOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_call_option_detailsOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_contactOrderByRelevanceFieldEnum = {
  contact_person: 'contact_person',
  address: 'address',
  contact_no: 'contact_no',
  email_id: 'email_id'
};

exports.Prisma.master_convertible_type_aOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_convertible_type_bOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_coupon_basisOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_coupon_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_craOrderByRelevanceFieldEnum = {
  code: 'code',
  description: 'description'
};

exports.Prisma.master_cra_statusOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_credit_rating_watchOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_day_countOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_depository_indicatorOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_exchange_bp_idOrderByRelevanceFieldEnum = {
  code: 'code',
  description: 'description'
};

exports.Prisma.master_frequencyOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_guaranteed_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_interest_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_issuerOrderByRelevanceFieldEnum = {
  isin: 'isin',
  security_class: 'security_class',
  security_name: 'security_name',
  series: 'series',
  convertible_flag: 'convertible_flag',
  option_flag: 'option_flag',
  tier_classification: 'tier_classification',
  compound_frequency: 'compound_frequency',
  call_desc: 'call_desc',
  put_desc: 'put_desc',
  isin_desc: 'isin_desc',
  convertible_details: 'convertible_details',
  stipulation_details: 'stipulation_details',
  guaranteed: 'guaranteed',
  if_taxable: 'if_taxable',
  stepupdwndtls: 'stepupdwndtls',
  freq_dis: 'freq_dis',
  intratupto: 'intratupto',
  intratlkto: 'intratlkto'
};

exports.Prisma.master_issuer_additionalOrderByRelevanceFieldEnum = {
  cin: 'cin',
  macro: 'macro',
  sector: 'sector',
  industry: 'industry',
  basicIndustry: 'basicIndustry',
  amountRaised: 'amountRaised',
  greenShoeOption: 'greenShoeOption',
  redemptionDate: 'redemptionDate',
  category: 'category',
  trancheNumber: 'trancheNumber',
  natureOfInstrument: 'natureOfInstrument',
  objectOfIssue: 'objectOfIssue',
  scheduledOpeningDate: 'scheduledOpeningDate',
  scheduledClosingDate: 'scheduledClosingDate',
  actualClosingDate: 'actualClosingDate'
};

exports.Prisma.master_issuer_dailyOrderByRelevanceFieldEnum = {
  isin: 'isin',
  security_class: 'security_class',
  security_name: 'security_name',
  series: 'series',
  convertible_flag: 'convertible_flag',
  option_flag: 'option_flag',
  tier_classification: 'tier_classification',
  compound_frequency: 'compound_frequency',
  call_desc: 'call_desc',
  put_desc: 'put_desc',
  isin_desc: 'isin_desc',
  convertible_details: 'convertible_details',
  debenture_trustee_name: 'debenture_trustee_name',
  stipulation_details: 'stipulation_details',
  guaranteed: 'guaranteed',
  if_taxable: 'if_taxable',
  stepupdwndtls: 'stepupdwndtls',
  freq_dis: 'freq_dis',
  intratupto: 'intratupto',
  intratlkto: 'intratlkto'
};

exports.Prisma.master_issuer_ownership_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_issuer_ratingOrderByRelevanceFieldEnum = {
  rating: 'rating',
  outlook: 'outlook',
  watch: 'watch',
  ratingAction: 'ratingAction'
};

exports.Prisma.master_issuer_stock_exchangeOrderByRelevanceFieldEnum = {
  stock_exchange: 'stock_exchange'
};

exports.Prisma.master_issuer_type_natureOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_issuer_type_rolesOrderByRelevanceFieldEnum = {
  name: 'name',
  slug: 'slug'
};

exports.Prisma.master_law_firmOrderByRelevanceFieldEnum = {
  law_firm_name: 'law_firm_name',
  partner_name: 'partner_name',
  locations: 'locations'
};

exports.Prisma.master_listing_statusOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_mode_issueOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_perpetual_nature_indicatorOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_put_option_detailsOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_redemption_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_registrarOrderByRelevanceFieldEnum = {
  registrar_name: 'registrar_name',
  short_name: 'short_name',
  website: 'website'
};

exports.Prisma.master_secured_flagOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_security_statusOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_security_typeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_seniority_tier_classificationOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_step_up_down_coupon_basisOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_tax_freeOrderByRelevanceFieldEnum = {
  description: 'description'
};

exports.Prisma.master_trusteeOrderByRelevanceFieldEnum = {
  trustee_name: 'trustee_name',
  short_name: 'short_name',
  trustshpd: 'trustshpd',
  website: 'website'
};

exports.Prisma.migrationsOrderByRelevanceFieldEnum = {
  migration: 'migration'
};

exports.Prisma.password_reset_tokensOrderByRelevanceFieldEnum = {
  email: 'email',
  token: 'token'
};

exports.Prisma.personal_access_tokensOrderByRelevanceFieldEnum = {
  tokenable_type: 'tokenable_type',
  name: 'name',
  token: 'token',
  abilities: 'abilities'
};

exports.Prisma.redis_cron_tableOrderByRelevanceFieldEnum = {
  fy: 'fy'
};

exports.Prisma.redis_iro_cron_tableOrderByRelevanceFieldEnum = {
  fy: 'fy'
};

exports.Prisma.sessionsOrderByRelevanceFieldEnum = {
  id: 'id',
  ip_address: 'ip_address',
  user_agent: 'user_agent',
  payload: 'payload'
};

exports.Prisma.user_enquiryOrderByRelevanceFieldEnum = {
  name: 'name',
  company_name: 'company_name',
  email: 'email',
  contact_number: 'contact_number',
  message: 'message'
};

exports.Prisma.usersOrderByRelevanceFieldEnum = {
  name: 'name',
  email: 'email',
  password: 'password',
  mobile: 'mobile',
  company_name: 'company_name',
  last_login_ip: 'last_login_ip',
  device_token: 'device_token',
  remember_token: 'remember_token',
  firebase_uid: 'firebase_uid',
  login_type: 'login_type',
  designation: 'designation',
  utm_source: 'utm_source'
};
exports.users_user_type = exports.$Enums.users_user_type = {
  TYPE_ONE: 'TYPE_ONE',
  TYPE_TWO: 'TYPE_TWO'
};

exports.Prisma.ModelName = {
  admin_setting: 'admin_setting',
  all_months: 'all_months',
  cache: 'cache',
  cache_locks: 'cache_locks',
  cron_status: 'cron_status',
  daily_issuer_cron_table: 'daily_issuer_cron_table',
  failed_jobs: 'failed_jobs',
  incorporatedate_cron: 'incorporatedate_cron',
  issuer_coupon_details: 'issuer_coupon_details',
  issuer_details: 'issuer_details',
  issuer_redemption_details: 'issuer_redemption_details',
  issuer_tenure_details: 'issuer_tenure_details',
  issuers: 'issuers',
  job_batches: 'job_batches',
  jobs: 'jobs',
  master_agency: 'master_agency',
  master_arranger: 'master_arranger',
  master_booking_basis: 'master_booking_basis',
  master_businees_sector_v1: 'master_businees_sector_v1',
  master_business_sector: 'master_business_sector',
  master_call_option_details: 'master_call_option_details',
  master_contact: 'master_contact',
  master_convertible_type_a: 'master_convertible_type_a',
  master_convertible_type_b: 'master_convertible_type_b',
  master_coupon_basis: 'master_coupon_basis',
  master_coupon_type: 'master_coupon_type',
  master_cra: 'master_cra',
  master_cra_status: 'master_cra_status',
  master_credit_rating_watch: 'master_credit_rating_watch',
  master_day_count: 'master_day_count',
  master_depository_indicator: 'master_depository_indicator',
  master_exchange_bp_id: 'master_exchange_bp_id',
  master_frequency: 'master_frequency',
  master_guaranteed_type: 'master_guaranteed_type',
  master_interest_type: 'master_interest_type',
  master_issuer: 'master_issuer',
  master_issuer_additional: 'master_issuer_additional',
  master_issuer_daily: 'master_issuer_daily',
  master_issuer_ownership_type: 'master_issuer_ownership_type',
  master_issuer_rating: 'master_issuer_rating',
  master_issuer_stock_exchange: 'master_issuer_stock_exchange',
  master_issuer_type_nature: 'master_issuer_type_nature',
  master_issuer_type_roles: 'master_issuer_type_roles',
  master_law_firm: 'master_law_firm',
  master_listing_status: 'master_listing_status',
  master_mode_issue: 'master_mode_issue',
  master_perpetual_nature_indicator: 'master_perpetual_nature_indicator',
  master_put_option_details: 'master_put_option_details',
  master_redemption_type: 'master_redemption_type',
  master_registrar: 'master_registrar',
  master_secured_flag: 'master_secured_flag',
  master_security_status: 'master_security_status',
  master_security_type: 'master_security_type',
  master_seniority_tier_classification: 'master_seniority_tier_classification',
  master_step_up_down_coupon_basis: 'master_step_up_down_coupon_basis',
  master_tax_free: 'master_tax_free',
  master_trustee: 'master_trustee',
  migrations: 'migrations',
  password_reset_tokens: 'password_reset_tokens',
  personal_access_tokens: 'personal_access_tokens',
  redis_cron_table: 'redis_cron_table',
  redis_iro_cron_table: 'redis_iro_cron_table',
  sessions: 'sessions',
  user_enquiry: 'user_enquiry',
  users: 'users'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }

        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
