const { getDb, initDatabase } = require('./database/init');
initDatabase();
const db = getDb();

// Create advanced tables
db.exec(`
  CREATE TABLE IF NOT EXISTS discovered_apps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    source TEXT,
    integration_id INTEGER,
    url TEXT,
    detected_users INTEGER DEFAULT 0,
    monthly_cost REAL DEFAULT 0,
    risk_level TEXT DEFAULT 'low',
    is_sanctioned INTEGER DEFAULT 0,
    last_seen TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS license_reclamation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    software_id INTEGER,
    software_name TEXT,
    user_name TEXT,
    user_email TEXT,
    last_used TEXT,
    days_inactive INTEGER DEFAULT 0,
    license_cost REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    action_taken TEXT,
    savings REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cloud_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_id INTEGER,
    resource_type TEXT,
    resource_name TEXT,
    region TEXT,
    provider TEXT,
    status TEXT DEFAULT 'running',
    hourly_cost REAL DEFAULT 0,
    monthly_cost REAL DEFAULT 0,
    tags TEXT,
    software_installed TEXT,
    last_scanned TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS shadow_it (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_name TEXT NOT NULL,
    detected_via TEXT,
    users_count INTEGER DEFAULT 0,
    first_detected TEXT,
    last_seen TEXT DEFAULT (datetime('now')),
    risk_level TEXT DEFAULT 'medium',
    category TEXT,
    monthly_cost_estimate REAL DEFAULT 0,
    status TEXT DEFAULT 'detected',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
console.log('Advanced tables created');

// Seed discovered apps
db.prepare('DELETE FROM discovered_apps').run();
const insDA = db.prepare('INSERT INTO discovered_apps (name,category,source,integration_id,url,detected_users,monthly_cost,risk_level,is_sanctioned) VALUES (?,?,?,?,?,?,?,?,?)');
[
  ['Microsoft 365','Productivity','SSO Provider',1,'https://office.com',500,11500.00,'low',1],
  ['Slack','Communication','SSO Provider',7,'https://slack.com',387,3390.75,'low',1],
  ['GitHub Enterprise','Development','SSO Provider',9,'https://github.com',87,1827.00,'low',1],
  ['Zoom','Communication','SSO Provider',8,'https://zoom.us',156,2494.44,'low',1],
  ['Salesforce','CRM','SSO Provider',3,'https://salesforce.com',68,10200.00,'low',1],
  ['Jira','Project Management','SSO Provider',10,'https://atlassian.net',134,1091.10,'low',1],
  ['Adobe Creative Cloud','Design','SSO Provider',11,'https://adobe.com',48,4079.52,'low',1],
  ['Figma Professional','Design','SSO Provider',null,'https://figma.com',22,990.00,'low',1],
  ['Notion Business','Productivity','SSO Provider',null,'https://notion.so',67,536.00,'medium',1],
  ['Dropbox (Personal)','Storage','Network Traffic',null,'https://dropbox.com',23,207.00,'medium',0],
  ['Trello','Project Management','SSO Provider',null,'https://trello.com',34,0.00,'low',1],
  ['Monday.com','Project Management','Network Traffic',null,'https://monday.com',12,480.00,'medium',0],
  ['Canva','Design','Network Traffic',null,'https://canva.com',18,162.00,'low',0],
  ['Loom','Communication','Network Traffic',null,'https://loom.com',28,280.00,'low',0],
  ['Grammarly Business','Productivity','Browser Extension',null,'https://grammarly.com',45,360.00,'low',1],
  ['1Password','Security','SSO Provider',null,'https://1password.com',187,1496.00,'low',1],
  ['DocuSign','Legal','SSO Provider',null,'https://docusign.com',38,1140.00,'low',1],
  ['Power BI','Analytics','SSO Provider',null,'https://powerbi.com',78,780.00,'low',1],
  ['ChatGPT (Personal)','AI Tools','Browser Extension',null,'https://chat.openai.com',89,890.00,'high',0],
  ['WhatsApp Web','Communication','Network Traffic',null,'https://web.whatsapp.com',67,0.00,'high',0],
].forEach(a => insDA.run(...a));
console.log('Discovered apps seeded: 20');

// Seed license reclamation
db.prepare('DELETE FROM license_reclamation').run();
const insLR = db.prepare('INSERT INTO license_reclamation (software_id,software_name,user_name,user_email,last_used,days_inactive,license_cost,status,action_taken,savings) VALUES (?,?,?,?,?,?,?,?,?,?)');
[
  [null,'Microsoft Office 365','David Chen','d.chen@company.com','2024-01-15',97,23.00,'pending',null,0],
  [null,'Microsoft Office 365','Emma Wilson','e.wilson@company.com','2024-01-08',104,23.00,'pending',null,0],
  [null,'Microsoft Office 365','Anna Garcia','a.garcia@company.com','2023-12-28',116,23.00,'pending',null,0],
  [null,'Adobe Creative Cloud','Robert Kim','r.kim@company.com','2023-11-20',154,84.99,'completed','License revoked and reassigned',84.99],
  [null,'Adobe Creative Cloud','Chris Anderson','c.anderson@company.com','2024-01-28',84,84.99,'pending',null,0],
  [null,'Slack Business+','Jennifer Lee','j.lee@company.com','2024-02-01',81,8.75,'pending',null,0],
  [null,'Zoom Meetings Pro','Michael Brown','m.brown@company.com','2023-12-15',129,15.99,'completed','License revoked',15.99],
  [null,'Zoom Meetings Pro','Kevin Johnson','k.johnson@company.com','2024-02-05',77,15.99,'pending',null,0],
  [null,'GitHub Enterprise Cloud','Sophie Turner','s.turner@company.com','2024-01-20',92,21.00,'pending',null,0],
  [null,'Salesforce Sales Cloud','James Martinez','j.martinez@company.com','2024-02-10',72,150.00,'in_review','Checking with department manager',0],
  [null,'Tableau Creator','Patricia White','p.white@company.com','2023-11-01',173,70.00,'completed','Reassigned to analytics team',70.00],
  [null,'Power BI Pro','Thomas Davis','t.davis@company.com','2024-01-12',100,10.00,'in_review','Last project completed - checking',0],
  [null,'Figma Professional','Mark Robinson','m.robinson@company.com','2024-01-30',83,45.00,'pending',null,0],
  [null,'Confluence Cloud','Linda Thompson','l.thompson@company.com','2024-02-08',74,5.75,'pending',null,0],
  [null,'Datadog APM','Ryan Scott','r.scott@company.com','2024-01-05',107,27.00,'pending',null,0],
].forEach(r => insLR.run(...r));
console.log('License reclamation seeded: 15');

// Seed cloud resources
db.prepare('DELETE FROM cloud_resources').run();
const insCR = db.prepare('INSERT INTO cloud_resources (integration_id,resource_type,resource_name,region,provider,status,hourly_cost,monthly_cost,tags,software_installed) VALUES (?,?,?,?,?,?,?,?,?,?)');
[
  [4,'EC2 Instance','web-prod-01','us-east-1','AWS','running',0.192,138.24,'app:web,env:prod','nginx 1.24, Node.js 20'],
  [4,'EC2 Instance','web-prod-02','us-east-1','AWS','running',0.192,138.24,'app:web,env:prod','nginx 1.24, Node.js 20'],
  [4,'EC2 Instance','api-prod-01','us-east-1','AWS','running',0.384,276.48,'app:api,env:prod','Node.js 20, PM2'],
  [4,'EC2 Instance','api-prod-02','us-east-1','AWS','running',0.384,276.48,'app:api,env:prod','Node.js 20, PM2'],
  [4,'RDS Instance','db-prod-01','us-east-1','AWS','running',0.960,691.20,'app:db,env:prod','PostgreSQL 15.2'],
  [4,'ElastiCache','redis-prod-01','us-east-1','AWS','running',0.068,48.96,'app:cache,env:prod','Redis 7.0'],
  [4,'S3 Bucket','company-backups','us-east-1','AWS','active',0.023,45.60,'purpose:backup',null],
  [4,'S3 Bucket','static-assets','us-east-1','AWS','active',0.023,18.40,'purpose:static',null],
  [4,'Lambda Function','pdf-processor','us-east-1','AWS','active',0.00,8.40,'app:pdf,env:prod',null],
  [4,'EC2 Instance','dev-server-01','us-east-2','AWS','stopped',0.096,0.00,'env:dev','Ubuntu 22.04, Docker'],
  [4,'EC2 Instance','staging-01','us-east-2','AWS','running',0.192,138.24,'env:staging','nginx, Node.js 20'],
  [4,'CloudFront','main-cdn','us-east-1','AWS','active',0.00,23.80,'app:cdn',null],
  [5,'Virtual Machine','vm-app-prod-01','eastus','Azure','running',0.276,198.72,'env:prod,app:erp','Windows Server 2022, IIS'],
  [5,'Virtual Machine','vm-sql-prod-01','eastus','Azure','running',0.552,397.44,'env:prod,app:sql','SQL Server 2022 Enterprise'],
  [5,'App Service','api-gateway-prod','eastus','Azure','running',0.138,99.36,'app:api,env:prod','ASP.NET Core 8'],
  [5,'Azure SQL','sqldb-prod-01','eastus','Azure','running',0.00,150.00,'app:db,env:prod','Azure SQL Database S3'],
  [5,'Storage Account','company-docs-eu','westeurope','Azure','active',0.00,12.50,'purpose:docs,region:eu',null],
  [5,'Virtual Machine','vm-dev-01','westus','Azure','deallocated',0.276,0.00,'env:dev',null],
  [5,'Azure Kubernetes','aks-prod-cluster','eastus','Azure','running',0.00,320.00,'app:microservices,env:prod','Kubernetes 1.28'],
  [5,'Azure Functions','func-notifications','eastus','Azure','active',0.00,5.60,'app:notifications',null],
].forEach(r => insCR.run(...r));
console.log('Cloud resources seeded: 20');

// Seed shadow IT
db.prepare('DELETE FROM shadow_it').run();
const insSI = db.prepare('INSERT INTO shadow_it (app_name,detected_via,users_count,first_detected,risk_level,category,monthly_cost_estimate,status,notes) VALUES (?,?,?,?,?,?,?,?,?)');
[
  ['ChatGPT (Personal)','Browser Extension',89,'2024-01-20','high','AI Tools',890.00,'under_review','Employees using personal ChatGPT - sensitive data risk. Evaluate Microsoft Copilot instead.'],
  ['WhatsApp Web','Network Traffic',67,'2023-12-01','high','Communication',0.00,'under_review','WhatsApp used for customer communications - not approved, GDPR concern.'],
  ['Dropbox Personal','Network Traffic',23,'2024-01-05','high','Storage',207.00,'detected','Personal Dropbox accounts found - potential IP and data leak risk.'],
  ['Box Personal','Network Traffic',7,'2024-01-18','high','Storage',63.00,'detected','Box personal accounts - potential intellectual property exposure.'],
  ['Monday.com','Network Traffic',12,'2024-01-12','medium','Project Management',480.00,'detected','Unmanaged Monday.com workspace found - merge into approved tools.'],
  ['Grammarly (Personal)','Browser Extension',34,'2023-11-15','medium','Productivity',272.00,'detected','Personal Grammarly accounts - upgrade to Grammarly Business recommended.'],
  ['Calendly Pro','SSO Provider',15,'2024-02-05','low','Productivity',150.00,'detected','Individual Calendly Pro subscriptions - evaluate team plan.'],
  ['Loom Free','Network Traffic',28,'2024-01-25','low','Communication',0.00,'detected','Screen recording tool widely used - evaluate Loom Business license.'],
  ['Canva Free','Network Traffic',18,'2024-02-01','low','Design',0.00,'detected','Canva Free used by marketing - consider Canva Pro team plan.'],
  ['Notion Free','Network Traffic',11,'2024-01-30','low','Productivity',0.00,'resolved','Personal Notion accounts - migrated to company Notion Business plan.'],
].forEach(s => insSI.run(...s));
console.log('Shadow IT seeded: 10');

console.log('\n=== FINAL TABLE COUNTS ===');
['users','software_assets','hardware_assets','licenses','cloud_integrations','vendors','contracts','audit_logs','maintenance_records','discovered_apps','license_reclamation','cloud_resources','shadow_it'].forEach(t => {
  try {
    const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c;
    console.log(' ' + t + ': ' + c);
  } catch(e) { console.log(' ' + t + ': ERROR - ' + e.message); }
});
