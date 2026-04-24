const { getDb, initDatabase } = require('./database/init');
const bcrypt = require('bcryptjs');

initDatabase();
const db = getDb();

// ── VENDORS ──────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM vendors').run();
const vendors = [
  ['Microsoft Corporation','Software','James Wilson','enterprise@microsoft.com','+1-800-642-7676','https://microsoft.com','One Microsoft Way, Redmond, WA 98052','active','Primary software vendor - Enterprise Agreement'],
  ['Dell Technologies','Hardware','Lisa Chen','dell.enterprise@dell.com','+1-800-289-3355','https://dell.com','One Dell Way, Round Rock, TX 78682','active','Primary hardware vendor - preferred partner'],
  ['Apple Inc.','Hardware/Software','Tom Bradley','business@apple.com','+1-800-692-7753','https://apple.com/business','One Apple Park Way, Cupertino, CA 95014','active','MacBook and iOS device supplier'],
  ['Cisco Systems','Network','Rachel Kim','cisco.ent@cisco.com','+1-800-553-6387','https://cisco.com','170 West Tasman Dr, San Jose, CA 95134','active','Network infrastructure - switches, routers, firewalls'],
  ['Adobe Inc.','Software','Mark Davis','adobe.ent@adobe.com','+1-800-833-6687','https://adobe.com','345 Park Ave, San Jose, CA 95110','active','Creative Cloud and Acrobat licenses'],
  ['Salesforce Inc.','Software','Nancy Park','sales@salesforce.com','+1-800-667-6389','https://salesforce.com','Salesforce Tower, SF, CA 94105','active','CRM platform and Slack licenses'],
  ['Atlassian','Software','Paul Hughes','support@atlassian.com','+1-415-701-1110','https://atlassian.com','350 Bush St, San Francisco, CA 94104','active','Jira, Confluence, and Bitbucket'],
  ['Amazon Web Services','Cloud','Megan Torres','aws-ent@amazon.com','+1-206-266-4064','https://aws.amazon.com','410 Terry Ave N, Seattle, WA 98109','active','Cloud infrastructure - EC2, S3, RDS'],
  ['Google LLC','Cloud/Software','Kevin Zhao','workspace@google.com','+1-650-253-0000','https://google.com','1600 Amphitheatre Pkwy, Mountain View, CA 94043','active','Google Workspace and GCP'],
  ['Zoom Video Comm.','Software','Sandra Lee','zoom.biz@zoom.us','+1-888-799-9666','https://zoom.us','55 Almaden Blvd, San Jose, CA 95113','active','Video conferencing and webinar'],
  ['GitHub (Microsoft)','Software','Daniel White','github.ent@github.com','+1-877-448-4820','https://github.com','88 Colin P Kelly Jr St, SF, CA 94107','active','Developer platform and CI/CD'],
  ['CrowdStrike','Security','Jessica Brown','cs.sales@crowdstrike.com','+1-888-512-8906','https://crowdstrike.com','150 Mathilda Pl, Sunnyvale, CA 94086','active','Endpoint security and threat intelligence'],
  ['Okta Inc.','Identity','Andrew Martin','okta.sales@okta.com','+1-888-722-7871','https://okta.com','100 First St, San Francisco, CA 94105','active','Identity and access management platform'],
  ['HP Inc.','Hardware','Susan Clark','hp.ent@hp.com','+1-800-474-6836','https://hp.com','1501 Page Mill Rd, Palo Alto, CA 94304','active','Printers, monitors, and peripherals'],
  ['Lenovo','Hardware','Robert Yang','lenovo.biz@lenovo.com','+1-855-253-6686','https://lenovo.com','1009 Think Place, Morrisville, NC 27560','active','ThinkPad laptops and server hardware'],
];
const insV = db.prepare('INSERT INTO vendors (name,type,contact_name,email,phone,website,address,status,notes) VALUES (?,?,?,?,?,?,?,?,?)');
vendors.forEach(v => insV.run(...v));
const vRows = db.prepare('SELECT id,name FROM vendors').all();
console.log('Vendors seeded:', vRows.length);

const msId = vRows.find(v => v.name.includes('Microsoft'))?.id;
const dellId = vRows.find(v => v.name.includes('Dell'))?.id;
const appleId = vRows.find(v => v.name.includes('Apple'))?.id;
const ciscoId = vRows.find(v => v.name.includes('Cisco'))?.id;
const adobeId = vRows.find(v => v.name.includes('Adobe'))?.id;
const sfId = vRows.find(v => v.name.includes('Salesforce'))?.id;
const atlId = vRows.find(v => v.name.includes('Atlassian'))?.id;
const awsId = vRows.find(v => v.name.includes('Amazon'))?.id;
const googleId = vRows.find(v => v.name.includes('Google'))?.id;
const zoomId = vRows.find(v => v.name.includes('Zoom'))?.id;
const csId = vRows.find(v => v.name.includes('CrowdStrike'))?.id;
const oktaId = vRows.find(v => v.name.includes('Okta'))?.id;
const hpId = vRows.find(v => v.name.includes('HP'))?.id;
const lenovoId = vRows.find(v => v.name.includes('Lenovo'))?.id;

// ── SOFTWARE ASSETS ───────────────────────────────────────────────────────────
db.prepare('DELETE FROM software_assets').run();
const software = [
  ['Microsoft Office 365','Microsoft','365 E3','Productivity','subscription',500,423,23.00,'2023-01-01','2025-12-31','active','Microsoft 365 E3 enterprise suite with Teams, SharePoint, OneDrive','IT'],
  ['Microsoft Teams','Microsoft','5.x','Communication','subscription',500,456,0.00,'2023-01-01','2025-12-31','active','Included with M365 - team chat and video calls','IT'],
  ['Microsoft SharePoint','Microsoft','Online','Productivity','subscription',500,312,0.00,'2023-01-01','2025-12-31','active','Intranet and document management','IT'],
  ['Microsoft OneDrive','Microsoft','Online','Storage','subscription',500,489,0.00,'2023-01-01','2025-12-31','active','1TB cloud storage per user','IT'],
  ['Adobe Creative Cloud','Adobe','2024','Design','subscription',50,48,84.99,'2023-06-01','2025-05-31','active','All-apps creative cloud subscription','Marketing'],
  ['Adobe Acrobat Pro','Adobe','2024','Productivity','subscription',100,87,23.99,'2023-01-01','2025-12-31','active','PDF creation, editing, and signing','Operations'],
  ['AutoCAD','Autodesk','2024','Engineering','subscription',25,20,235.00,'2022-03-15','2025-03-15','active','2D/3D CAD design software','Engineering'],
  ['Revit','Autodesk','2024','Engineering','subscription',10,8,335.00,'2022-03-15','2025-03-15','active','BIM design and documentation','Engineering'],
  ['Slack Business+','Salesforce','4.35','Communication','subscription',500,387,8.75,'2023-01-01','2025-12-31','active','Team messaging, file sharing, integrations','IT'],
  ['Zoom Meetings Pro','Zoom Video','5.17','Communication','subscription',200,156,15.99,'2023-04-01','2025-03-31','active','Video conferencing up to 300 participants','IT'],
  ['Zoom Webinar','Zoom Video','5.17','Communication','subscription',10,4,79.99,'2023-04-01','2025-03-31','active','Webinar hosting for up to 1000 attendees','Marketing'],
  ['Zoom Phone','Zoom Video','5.17','Communication','subscription',150,143,10.00,'2023-04-01','2025-03-31','active','Cloud phone system with PSTN calling','Operations'],
  ['GitHub Enterprise Cloud','Microsoft','3.12','Development','subscription',100,87,21.00,'2023-01-01','2025-12-31','active','Source control and CI/CD pipelines','Engineering'],
  ['Azure DevOps','Microsoft','2024','Development','subscription',100,89,6.00,'2023-01-01','2025-12-31','active','Boards, repos, pipelines, test plans','Engineering'],
  ['Jira Software Cloud','Atlassian','9.12','Project Management','subscription',150,134,8.15,'2023-01-01','2025-12-31','active','Agile project and issue tracking','Engineering'],
  ['Confluence Cloud','Atlassian','8.7','Documentation','subscription',150,112,5.75,'2023-01-01','2025-12-31','active','Team wiki and knowledge base','Engineering'],
  ['Salesforce Sales Cloud','Salesforce','Spring 24','CRM','subscription',75,68,150.00,'2022-07-01','2025-06-30','active','CRM platform for sales team','Sales'],
  ['Salesforce Service Cloud','Salesforce','Spring 24','CRM','subscription',25,22,150.00,'2022-07-01','2025-06-30','active','Customer service management','Support'],
  ['Google Workspace Ent Plus','Google','Enterprise Plus','Productivity','subscription',250,198,18.00,'2023-01-01','2025-12-31','active','Gmail, Drive, Docs, Meet enterprise suite','Operations'],
  ['Windows 11 Pro','Microsoft','23H2','OS','perpetual',300,285,200.00,'2022-01-01',null,'active','Windows 11 Professional OEM licenses','IT'],
  ['Windows Server 2022 Datacenter','Microsoft','21H2','OS','perpetual',20,12,1068.00,'2022-01-01',null,'active','Windows Server Datacenter - unlimited VMs','IT'],
  ['SQL Server 2022 Enterprise','Microsoft','16.x','Database','perpetual',8,8,14256.00,'2022-06-01',null,'active','Enterprise database with SA','IT'],
  ['CrowdStrike Falcon Pro','CrowdStrike','7.14','Security','subscription',500,412,15.99,'2023-01-01','2025-12-31','active','Next-gen AV and EDR platform','IT'],
  ['Okta Workforce Identity','Okta','2024.1','Security','subscription',750,712,8.00,'2023-01-01','2025-12-31','active','SSO, MFA, lifecycle management','IT'],
  ['Splunk Enterprise','Splunk','9.2','Security','subscription',5,5,180.00,'2022-06-01','2024-05-31','active','SIEM and log analytics platform','IT'],
  ['1Password Business','1Password','8.x','Security','subscription',200,187,8.00,'2023-01-01','2025-12-31','active','Enterprise password and secrets management','IT'],
  ['Tableau Creator','Salesforce','2024.1','Analytics','subscription',30,24,70.00,'2023-03-01','2025-02-28','active','Self-service data visualization','Analytics'],
  ['Power BI Pro','Microsoft','2024','Analytics','subscription',100,78,10.00,'2023-01-01','2025-12-31','active','Business intelligence and dashboards','Analytics'],
  ['Datadog APM','Datadog','2024','Monitoring','subscription',20,20,27.00,'2023-03-01','2025-02-28','active','Full-stack application monitoring','IT'],
  ['Notion Business','Notion Labs','2024','Productivity','subscription',100,67,8.00,'2023-06-01','2025-05-31','active','Notes, wikis, and project management','Operations'],
  ['DocuSign Business Pro','DocuSign','2024','Legal','subscription',50,38,30.00,'2023-01-01','2025-12-31','active','eSignature and agreement management','Legal'],
  ['Figma Professional','Figma','2024','Design','subscription',25,22,45.00,'2023-01-01','2025-12-31','active','Collaborative UI/UX design tool','Design'],
  ['Miro Team','Miro','2024','Productivity','subscription',75,56,10.00,'2023-06-01','2025-05-31','active','Online whiteboard and collaboration','Design'],
  ['Lucidchart Team','Lucid','2024','Productivity','subscription',50,34,9.00,'2023-01-01','2025-12-31','active','Diagramming and visual workspace','Operations'],
  ['Snyk Enterprise','Snyk','2024','Security','subscription',50,45,98.00,'2023-03-01','2025-02-28','active','Developer-first security scanning','Engineering'],
];
const insS = db.prepare('INSERT INTO software_assets (name,vendor,version,category,license_type,total_licenses,used_licenses,cost_per_license,purchase_date,expiry_date,status,description,department) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
software.forEach(s => insS.run(...s));
console.log('Software seeded:', software.length);

// ── HARDWARE ASSETS ───────────────────────────────────────────────────────────
db.prepare('DELETE FROM hardware_assets').run();
const hw = [
  ['HW-LT-001','Dell XPS 15 Laptop','Laptop','Dell','XPS 15 9530','SN-DL-LT-001','active','excellent','HQ - Floor 2 - Desk 2A','John Smith',5,'Engineering','2022-06-15',2499.00,'2025-06-15','Intel Core i9-13900H','32GB DDR5','1TB NVMe SSD','Windows 11 Pro','192.168.1.101','AA:BB:CC:DD:EE:01'],
  ['HW-LT-002','MacBook Pro 16 M3','Laptop','Apple','MacBook Pro 16 M3 Pro','SN-AP-LT-001','active','excellent','HQ - Floor 3 - Desk 3B','Sarah Johnson',6,'Marketing','2023-01-20',3499.00,'2026-01-20','Apple M3 Pro','36GB Unified','512GB SSD','macOS Sonoma 14','192.168.1.102','AA:BB:CC:DD:EE:02'],
  ['HW-LT-003','Lenovo ThinkPad X1 Carbon','Laptop','Lenovo','ThinkPad X1 Carbon Gen 11','SN-LN-LT-001','active','good','HQ - Floor 1 - Desk 1C','IT Manager',2,'IT','2023-03-10',1899.00,'2026-03-10','Intel Core i7-1365U','16GB LPDDR5','512GB NVMe','Windows 11 Pro','192.168.1.103','AA:BB:CC:DD:EE:03'],
  ['HW-LT-004','Dell Latitude 5540','Laptop','Dell','Latitude 5540','SN-DL-LT-002','active','good','HQ - Floor 1 - Desk 1D','Asset Manager',4,'Operations','2023-05-20',1299.00,'2026-05-20','Intel Core i5-1345U','16GB DDR4','256GB SSD','Windows 11 Pro','192.168.1.104','AA:BB:CC:DD:EE:04'],
  ['HW-LT-005','MacBook Air 13 M2','Laptop','Apple','MacBook Air 13 M2','SN-AP-LT-002','active','excellent','HQ - Floor 2 - Desk 2E','Auditor',7,'Finance','2023-07-01',1299.00,'2026-07-01','Apple M2','8GB Unified','256GB SSD','macOS Sonoma 14','192.168.1.105','AA:BB:CC:DD:EE:05'],
  ['HW-LT-006','HP EliteBook 840 G10','Laptop','HP','EliteBook 840 G10','SN-HP-LT-001','active','good','HQ - Floor 2 - Desk 2F','',null,'HR','2022-11-15',1549.00,'2025-11-15','Intel Core i7-1355U','16GB DDR5','512GB SSD','Windows 11 Pro','192.168.1.106','AA:BB:CC:DD:EE:06'],
  ['HW-LT-007','Lenovo ThinkPad L15','Laptop','Lenovo','ThinkPad L15 Gen 4','SN-LN-LT-002','in_repair','fair','IT Storage - Repair Bay','',null,'IT','2021-08-10',1199.00,'2024-08-10','Intel Core i5-1335U','8GB DDR4','256GB SSD','Windows 11 Pro','','AA:BB:CC:DD:EE:07'],
  ['HW-LT-008','Dell XPS 13 (Retired)','Laptop','Dell','XPS 13 9320','SN-DL-LT-003','retired','poor','IT Storage - Retired','',null,'Engineering','2020-01-15',1499.00,'2023-01-15','Intel Core i7-1250U','16GB LPDDR4','512GB SSD','Windows 11 Pro','','AA:BB:CC:DD:EE:08'],
  ['HW-LT-009','MacBook Pro 14 M1 Pro','Laptop','Apple','MacBook Pro 14 M1 Pro','SN-AP-LT-003','active','good','HQ - Floor 1 - Desk 1H','',null,'Sales','2022-01-10',1999.00,'2025-01-10','Apple M1 Pro','16GB Unified','512GB SSD','macOS Sonoma 14','192.168.1.109','AA:BB:CC:DD:EE:09'],
  ['HW-LT-010','Dell Precision 5570','Laptop','Dell','Precision 5570','SN-DL-LT-004','active','good','Design Studio - Desk D2','',null,'Design','2023-02-20',2199.00,'2026-02-20','Intel Core i7-12700H','32GB DDR5','1TB NVMe SSD','Windows 11 Pro','192.168.1.110','AA:BB:CC:DD:EE:10'],
  ['HW-DT-001','HP ProDesk 600 G9','Desktop','HP','ProDesk 600 G9 SFF','SN-HP-DT-001','active','good','HQ - Floor 1 - Reception','',null,'Operations','2022-03-10',1200.00,'2025-03-10','Intel Core i7-12700','16GB DDR4','512GB SSD','Windows 11 Pro','192.168.1.201','AA:BB:CC:DD:EE:11'],
  ['HW-DT-002','Dell OptiPlex 7000 SFF','Desktop','Dell','OptiPlex 7000 SFF','SN-DL-DT-001','active','good','HQ - Floor 1 - Finance','',null,'Finance','2022-06-20',999.00,'2025-06-20','Intel Core i5-12500','16GB DDR4','512GB SSD','Windows 11 Pro','192.168.1.202','AA:BB:CC:DD:EE:12'],
  ['HW-DT-003','Apple Mac Mini M2 Pro','Desktop','Apple','Mac Mini M2 Pro','SN-AP-DT-001','active','excellent','Design Studio - Desk D1','',null,'Design','2023-02-15',1299.00,'2026-02-15','Apple M2 Pro','16GB Unified','512GB SSD','macOS Sonoma 14','192.168.1.203','AA:BB:CC:DD:EE:13'],
  ['HW-DT-004','HP Z4 Workstation','Desktop','HP','Z4 G4 Workstation','SN-HP-DT-002','active','good','Engineering - Lab','',null,'Engineering','2021-09-01',3500.00,'2024-09-01','Intel Xeon W-2235','64GB ECC DDR4','2TB NVMe + 4TB HDD','Windows 11 Pro','192.168.1.204','AA:BB:CC:DD:EE:14'],
  ['HW-SV-001','Dell PowerEdge R750xs','Server','Dell','PowerEdge R750xs','SN-DL-SV-001','active','good','DC-RACK-A01','',null,'IT','2022-08-20',15000.00,'2025-08-20','Intel Xeon Gold 6330 (2x)','256GB ECC DDR4','10TB RAID-10','Windows Server 2022','10.0.0.10','00:11:22:33:44:01'],
  ['HW-SV-002','Dell PowerEdge R650xs','Server','Dell','PowerEdge R650xs','SN-DL-SV-002','active','good','DC-RACK-A02','',null,'IT','2022-08-20',12000.00,'2025-08-20','Intel Xeon Silver 4310 (2x)','128GB ECC DDR4','4TB RAID-5','Ubuntu Server 22.04','10.0.0.11','00:11:22:33:44:02'],
  ['HW-SV-003','HP ProLiant DL380 Gen10','Server','HP','ProLiant DL380 Gen10','SN-HP-SV-001','active','fair','DC-RACK-B01','',null,'IT','2021-04-15',9800.00,'2024-04-15','Intel Xeon Gold 5218 (2x)','64GB DDR4','2TB RAID-1','VMware ESXi 8.0','10.0.0.12','00:11:22:33:44:03'],
  ['HW-SV-004','Dell PowerEdge R440','Server','Dell','PowerEdge R440','SN-DL-SV-003','active','fair','DC-RACK-C01','',null,'IT','2020-11-01',7500.00,'2023-11-01','Intel Xeon Silver 4208 (2x)','64GB DDR4','2TB RAID-1','Ubuntu Server 22.04','10.0.0.13','00:11:22:33:44:04'],
  ['HW-NW-001','Cisco Catalyst 9300-48P','Network Switch','Cisco','Catalyst 9300-48P','SN-CS-SW-001','active','good','Server Room - Core Switch','',null,'IT','2021-11-05',8500.00,'2026-11-05',null,null,null,'IOS-XE 17.9.4','10.0.0.2','00:1A:2B:3C:4D:01'],
  ['HW-NW-002','Cisco Catalyst 9200L-24P','Network Switch','Cisco','Catalyst 9200L-24P','SN-CS-SW-002','active','good','HQ - Floor 1 - IDF','',null,'IT','2022-03-10',3200.00,'2027-03-10',null,null,null,'IOS-XE 17.9.4','10.0.0.3','00:1A:2B:3C:4D:02'],
  ['HW-NW-003','Cisco Catalyst 9200L-48P','Network Switch','Cisco','Catalyst 9200L-48P','SN-CS-SW-003','active','good','HQ - Floor 2 - IDF','',null,'IT','2022-03-10',4100.00,'2027-03-10',null,null,null,'IOS-XE 17.9.4','10.0.0.4','00:1A:2B:3C:4D:03'],
  ['HW-FW-001','Cisco ASA 5506-X','Firewall','Cisco','ASA 5506-X FirePOWER','SN-CS-FW-001','active','good','Server Room - Edge','',null,'IT','2020-05-15',1200.00,'2025-05-15',null,null,null,'ASA OS 9.18.1','10.0.0.1','00:1A:2B:3C:4D:05'],
  ['HW-FW-002','Cisco Meraki MX85','Firewall','Cisco','Meraki MX85','SN-MK-FW-001','active','excellent','Branch Office BF1','',null,'IT','2023-01-10',2800.00,'2026-01-10',null,null,null,'MX 18.2','10.1.0.1','00:1A:2B:3C:5E:01'],
  ['HW-MB-001','Apple iPhone 15 Pro','Mobile','Apple','iPhone 15 Pro 256GB','SN-AP-MB-001','active','excellent','User: John Smith','John Smith',5,'Engineering','2023-09-22',1199.00,'2026-09-22',null,null,null,'iOS 17.4','','AA:BB:CC:FF:01:01'],
  ['HW-MB-002','Apple iPhone 14','Mobile','Apple','iPhone 14 128GB','SN-AP-MB-002','active','good','User: Sarah Johnson','Sarah Johnson',6,'Marketing','2022-09-16',799.00,'2025-09-16',null,null,null,'iOS 17.4','','AA:BB:CC:FF:01:02'],
  ['HW-MB-003','Samsung Galaxy S24 Ultra','Mobile','Samsung','Galaxy S24 Ultra','SN-SG-MB-001','active','excellent','User: IT Manager','IT Manager',2,'IT','2024-01-20',1299.00,'2027-01-20',null,null,null,'Android 14','','AA:BB:CC:FF:01:03'],
  ['HW-TB-001','Apple iPad Pro 12.9 M2','Tablet','Apple','iPad Pro 12.9 M2','SN-AP-TB-001','active','excellent','Conference Room A','',null,'Operations','2023-04-01',1099.00,'2026-04-01',null,null,null,'iPadOS 17.4','','AA:BB:CC:FF:02:01'],
  ['HW-TB-002','Microsoft Surface Pro 9','Tablet','Microsoft','Surface Pro 9','SN-MS-TB-001','active','good','Sales - Mobile','',null,'Sales','2023-02-10',1599.00,'2026-02-10','Intel Core i7-1255U','16GB LPDDR5','256GB SSD','Windows 11 Pro','','AA:BB:CC:FF:02:02'],
  ['HW-MN-001','LG UltraWide 34 Curved','Monitor','LG','34WN780-B','SN-LG-MN-001','active','excellent','HQ - Floor 2 - Desk 2A','John Smith',5,'Engineering','2022-06-15',549.00,'2025-06-15',null,null,null,null,'',''],
  ['HW-MN-002','Dell UltraSharp 27 U2722','Monitor','Dell','UltraSharp U2722','SN-DL-MN-001','active','good','HQ - Floor 1 - Finance','',null,'Finance','2022-01-10',399.00,'2025-01-10',null,null,null,null,'',''],
  ['HW-MN-003','Dell UltraSharp 27 U2722','Monitor','Dell','UltraSharp U2722','SN-DL-MN-002','active','good','HQ - Floor 3 - Desk 3B','Sarah Johnson',6,'Marketing','2023-01-20',399.00,'2026-01-20',null,null,null,null,'',''],
  ['HW-MN-004','HP Z27k G3 4K','Monitor','HP','Z27k G3 4K','SN-HP-MN-001','active','excellent','Engineering - Lab','',null,'Engineering','2022-09-10',549.00,'2025-09-10',null,null,null,null,'',''],
  ['HW-PR-001','HP LaserJet Pro M404dn','Printer','HP','LaserJet Pro M404dn','SN-HP-PR-001','active','good','HQ - Floor 1 - Print Room','',null,'Operations','2021-04-10',350.00,'2024-04-10',null,null,null,null,'192.168.1.250','AA:BB:CC:DD:FF:01'],
  ['HW-PR-002','HP Color LaserJet M554dn','Printer','HP','Color LaserJet Enterprise M554','SN-HP-PR-002','active','good','HQ - Floor 2 - Print Room','',null,'Operations','2022-02-14',699.00,'2025-02-14',null,null,null,null,'192.168.1.251','AA:BB:CC:DD:FF:02'],
  ['HW-PR-003','Canon imageRUNNER C3226','Printer','Canon','imageRUNNER Advance C3226i','SN-CN-PR-001','active','good','HQ - Floor 3 - Shared','',null,'Operations','2022-05-20',2200.00,'2025-05-20',null,null,null,null,'192.168.1.252','AA:BB:CC:DD:FF:03'],
  ['HW-ST-001','Synology DS923+ NAS','Storage','Synology','DiskStation DS923+','SN-SY-ST-001','active','good','Server Room - Storage Rack','',null,'IT','2022-12-01',800.00,'2025-12-01',null,null,'32TB RAID-6',null,'10.0.0.20','00:11:22:44:55:01'],
  ['HW-AP-001','Cisco Catalyst 9105AXI','Access Point','Cisco','Catalyst 9105AXI','SN-CS-AP-001','active','excellent','HQ - Floor 1 - Ceiling','',null,'IT','2023-05-10',599.00,'2026-05-10',null,null,null,'IOS-XE 17.12','10.0.0.50','00:1A:2B:3C:6E:01'],
  ['HW-AP-002','Cisco Catalyst 9105AXI','Access Point','Cisco','Catalyst 9105AXI','SN-CS-AP-002','active','excellent','HQ - Floor 2 - Ceiling','',null,'IT','2023-05-10',599.00,'2026-05-10',null,null,null,'IOS-XE 17.12','10.0.0.51','00:1A:2B:3C:6E:02'],
  ['HW-AP-003','Cisco Catalyst 9105AXI','Access Point','Cisco','Catalyst 9105AXI','SN-CS-AP-003','active','excellent','HQ - Floor 3 - Ceiling','',null,'IT','2023-05-10',599.00,'2026-05-10',null,null,null,'IOS-XE 17.12','10.0.0.52','00:1A:2B:3C:6E:03'],
  ['HW-UPS-001','APC Smart-UPS 3000VA','UPS','APC','Smart-UPS SMT3000RM2U','SN-APC-UP-001','active','good','Server Room - Rack A','',null,'IT','2021-06-15',1200.00,'2024-06-15',null,null,null,null,'10.0.0.60','00:C0:B7:AA:BB:01'],
];
const insH = db.prepare('INSERT INTO hardware_assets (asset_tag,name,type,manufacturer,model,serial_number,status,condition,location,assigned_to,assigned_user_id,department,purchase_date,purchase_cost,warranty_expiry,processor,ram,storage,os,ip_address,mac_address) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
hw.forEach(h => insH.run(...h));
console.log('Hardware seeded:', hw.length);

// ── LICENSES ──────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM licenses').run();
const swRows = db.prepare('SELECT id,name FROM software_assets').all();
const swMap = {};
swRows.forEach(s => swMap[s.name] = s.id);

const licenses = [
  [swMap['Microsoft Office 365'], 'M365-EA-2023-001', 'subscription', 300, 265, '2023-01-01', '2025-12-31', 82800.00, 'Microsoft', 'PO-2023-0042', 'active', 'Enterprise Agreement - Batch 1'],
  [swMap['Microsoft Office 365'], 'M365-EA-2023-002', 'subscription', 200, 158, '2023-01-01', '2025-12-31', 55200.00, 'Microsoft', 'PO-2023-0042', 'active', 'Enterprise Agreement - Batch 2'],
  [swMap['Adobe Creative Cloud'], 'ADOBE-CC-2023-ENT', 'subscription', 50, 48, '2023-06-01', '2025-05-31', 50994.00, 'Adobe', 'PO-2023-0108', 'active', 'Enterprise VIP agreement'],
  [swMap['Adobe Acrobat Pro'], 'ADOBE-ACR-2023-ENT', 'subscription', 100, 87, '2023-01-01', '2025-12-31', 28788.00, 'Adobe', 'PO-2023-0108', 'active', 'Adobe Acrobat Pro bulk license'],
  [swMap['AutoCAD'], 'ADSK-ACAD-2022-001', 'subscription', 25, 20, '2022-03-15', '2025-03-15', 70500.00, 'Autodesk', 'PO-2022-0201', 'active', 'Autodesk Flex subscription'],
  [swMap['Slack Business+'], 'SLACK-BIZ-2023-001', 'subscription', 500, 387, '2023-01-01', '2025-12-31', 52500.00, 'Salesforce', 'PO-2023-0055', 'active', 'Slack Business+ annual'],
  [swMap['Zoom Meetings Pro'], 'ZOOM-PRO-2023-001', 'subscription', 200, 156, '2023-04-01', '2025-03-31', 38376.00, 'Zoom', 'PO-2023-0078', 'active', 'Zoom Pro 200 hosts annual'],
  [swMap['GitHub Enterprise Cloud'], 'GH-ENT-2023-001', 'subscription', 100, 87, '2023-01-01', '2025-12-31', 25200.00, 'Microsoft', 'PO-2023-0061', 'active', 'GitHub Enterprise Cloud'],
  [swMap['Jira Software Cloud'], 'JIRA-CLOUD-2023-001', 'subscription', 150, 134, '2023-01-01', '2025-12-31', 14670.00, 'Atlassian', 'PO-2023-0044', 'active', 'Atlassian Cloud Standard'],
  [swMap['Salesforce Sales Cloud'], 'SF-SALES-2022-001', 'subscription', 75, 68, '2022-07-01', '2025-06-30', 135000.00, 'Salesforce', 'PO-2022-0312', 'active', 'Salesforce Sales Cloud Enterprise'],
  [swMap['Windows 11 Pro'], 'WIN11-OEM-2022-001', 'perpetual', 150, 145, '2022-01-01', null, 30000.00, 'Microsoft', 'PO-2022-0011', 'active', 'Windows 11 Pro OEM batch 1'],
  [swMap['Windows 11 Pro'], 'WIN11-OEM-2022-002', 'perpetual', 150, 140, '2022-06-01', null, 30000.00, 'Microsoft', 'PO-2022-0187', 'active', 'Windows 11 Pro OEM batch 2'],
  [swMap['CrowdStrike Falcon Pro'], 'CS-FALCON-2023-001', 'subscription', 500, 412, '2023-01-01', '2025-12-31', 95940.00, 'CrowdStrike', 'PO-2023-0039', 'active', 'CrowdStrike Falcon Pro annual'],
  [swMap['Okta Workforce Identity'], 'OKTA-WF-2023-001', 'subscription', 750, 712, '2023-01-01', '2025-12-31', 72000.00, 'Okta', 'PO-2023-0031', 'active', 'Okta Workforce Identity Cloud'],
  [swMap['Power BI Pro'], 'PBI-PRO-2023-001', 'subscription', 100, 78, '2023-01-01', '2025-12-31', 12000.00, 'Microsoft', 'PO-2023-0042', 'active', 'Power BI Pro add-on'],
  [swMap['Splunk Enterprise'], 'SPLUNK-ENT-2022-001', 'subscription', 5, 5, '2022-06-01', '2024-05-31', 10800.00, 'Splunk', 'PO-2022-0289', 'active', 'Splunk Enterprise 5 indexer'],
  [swMap['Google Workspace Ent Plus'], 'GOOG-WS-2023-001', 'subscription', 250, 198, '2023-01-01', '2025-12-31', 54000.00, 'Google', 'PO-2023-0049', 'active', 'Google Workspace Enterprise Plus'],
  [swMap['Figma Professional'], 'FIGMA-PRO-2023-001', 'subscription', 25, 22, '2023-01-01', '2025-12-31', 13500.00, 'Figma', 'PO-2023-0099', 'active', 'Figma Professional team plan'],
  [swMap['DocuSign Business Pro'], 'DOCU-BIZ-2023-001', 'subscription', 50, 38, '2023-01-01', '2025-12-31', 18000.00, 'DocuSign', 'PO-2023-0071', 'active', 'DocuSign Business Pro annual'],
  [swMap['1Password Business'], '1PASS-BIZ-2023-001', 'subscription', 200, 187, '2023-01-01', '2025-12-31', 19200.00, '1Password', 'PO-2023-0085', 'active', '1Password Business team plan'],
];
const insL = db.prepare('INSERT INTO licenses (software_id,license_key,license_type,seats,used_seats,purchase_date,expiry_date,cost,vendor,order_number,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
licenses.forEach(l => insL.run(...l));
console.log('Licenses seeded:', licenses.length);

// ── CONTRACTS ─────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM contracts').run();
const contracts = [
  ['Microsoft Enterprise Agreement FY2023-2025', msId, 'Enterprise License', '2023-01-01', '2025-12-31', 420000.00, 'active', 1, 90, 'Covers M365 E3, Windows, SQL Server, Azure DevOps, GitHub, Power BI'],
  ['Dell Hardware Refresh 2022-2025', dellId, 'Hardware Purchase', '2022-06-01', '2025-05-31', 125000.00, 'active', 0, 30, 'Laptop, desktop, and server procurement cycle'],
  ['Apple Device Program', appleId, 'Hardware Purchase', '2023-01-01', '2025-12-31', 45000.00, 'active', 1, 60, 'MacBook and iPhone enterprise program'],
  ['Cisco SmartNet - Core Infrastructure', ciscoId, 'Maintenance', '2023-01-01', '2025-12-31', 38000.00, 'active', 1, 90, 'SmartNet coverage for all core switches and firewalls'],
  ['Adobe Creative Cloud Enterprise VIP', adobeId, 'SaaS Subscription', '2023-06-01', '2025-05-31', 79782.00, 'active', 1, 60, 'Creative Cloud all-apps + Acrobat Pro VIP agreement'],
  ['Salesforce Platform License FY23', sfId, 'SaaS Subscription', '2022-07-01', '2025-06-30', 195000.00, 'active', 1, 90, 'Sales Cloud + Service Cloud + Slack annual agreement'],
  ['Atlassian Cloud Subscription', atlId, 'SaaS Subscription', '2023-01-01', '2025-12-31', 29340.00, 'active', 1, 60, 'Jira Software + Confluence + Bitbucket Cloud Standard'],
  ['AWS Enterprise Support', awsId, 'Cloud Services', '2023-01-01', '2025-12-31', 72000.00, 'active', 1, 30, 'AWS Enterprise Support + committed spend agreement'],
  ['Google Workspace Enterprise Plus', googleId, 'SaaS Subscription', '2023-01-01', '2025-12-31', 54000.00, 'active', 1, 90, 'Google Workspace Enterprise Plus 250 seats'],
  ['Zoom Unified Communications', zoomId, 'SaaS Subscription', '2023-04-01', '2025-03-31', 79350.00, 'active', 1, 90, 'Zoom Meetings + Phone + Webinar bundle'],
  ['CrowdStrike Falcon Pro Annual', csId, 'SaaS Subscription', '2023-01-01', '2025-12-31', 95940.00, 'active', 1, 60, 'Falcon Pro EDR 500 endpoints'],
  ['Okta Workforce Identity', oktaId, 'SaaS Subscription', '2023-01-01', '2025-12-31', 72000.00, 'active', 1, 90, 'Okta SSO + MFA + Lifecycle Management 750 users'],
  ['HP Equipment Maintenance', hpId, 'Maintenance', '2022-01-01', '2024-12-31', 12000.00, 'expiring_soon', 0, 30, 'HP Care Pack for printers and desktops'],
  ['Lenovo Premier Support', lenovoId, 'Maintenance', '2023-03-01', '2026-02-28', 8500.00, 'active', 1, 60, 'Lenovo Premier Support 3-year for ThinkPad fleet'],
  ['Splunk Enterprise License', null, 'SaaS Subscription', '2022-06-01', '2024-05-31', 10800.00, 'expiring_soon', 0, 30, 'Splunk Enterprise 5 indexer license - needs renewal'],
  ['Datadog APM Annual', null, 'SaaS Subscription', '2023-03-01', '2025-02-28', 6480.00, 'active', 1, 60, 'Datadog APM Pro 20 hosts'],
  ['DocuSign Business Pro', null, 'SaaS Subscription', '2023-01-01', '2025-12-31', 18000.00, 'active', 1, 60, 'DocuSign Business Pro 50 users'],
  ['Figma Professional', null, 'SaaS Subscription', '2023-01-01', '2025-12-31', 13500.00, 'active', 1, 30, 'Figma Professional 25 seats'],
];
const insC = db.prepare('INSERT INTO contracts (title,vendor_id,type,start_date,end_date,value,status,auto_renew,renewal_notice_days,description) VALUES (?,?,?,?,?,?,?,?,?,?)');
contracts.forEach(c => insC.run(...c));
console.log('Contracts seeded:', contracts.length);

// ── MAINTENANCE RECORDS ───────────────────────────────────────────────────────
db.prepare('DELETE FROM maintenance_records').run();
const hwRows = db.prepare('SELECT id,asset_tag FROM hardware_assets').all();
const hwMap = {};
hwRows.forEach(h => hwMap[h.asset_tag] = h.id);

const maint = [
  [hwMap['HW-SV-001'], 'Preventive Maintenance', 'Quarterly server health check - replaced fans, cleaned filters, verified RAID', 'IT Team', 250.00, '2024-01-15', '2024-04-15', 'completed'],
  [hwMap['HW-SV-001'], 'Firmware Update', 'Updated iDRAC, BIOS, and NIC firmware to latest versions', 'IT Team', 0.00, '2024-03-01', '2024-09-01', 'completed'],
  [hwMap['HW-SV-002'], 'Preventive Maintenance', 'Quarterly health check - RAM tested, drives verified', 'IT Team', 200.00, '2024-01-15', '2024-04-15', 'completed'],
  [hwMap['HW-SV-003'], 'Disk Replacement', 'Replaced failed 600GB SAS drive in slot 4 - RAID rebuilt successfully', 'HP Field Tech', 450.00, '2024-02-08', '2024-08-08', 'completed'],
  [hwMap['HW-SV-004'], 'Memory Upgrade', 'Added 2x 32GB ECC DIMMs to increase capacity from 64GB to 128GB', 'IT Team', 380.00, '2024-01-20', '2025-01-20', 'completed'],
  [hwMap['HW-NW-001'], 'Firmware Update', 'Updated IOS-XE to 17.9.4 - applied security patches', 'Network Team', 0.00, '2024-02-12', '2024-08-12', 'completed'],
  [hwMap['HW-NW-003'], 'Port Repair', 'Replaced 3 faulty PoE ports, tested all 48 ports', 'Cisco TAC', 320.00, '2024-01-28', '2025-01-28', 'completed'],
  [hwMap['HW-LT-007'], 'Keyboard Replacement', 'Liquid damage repair - keyboard and trackpad replaced under warranty', 'Lenovo Service', 0.00, '2024-03-05', null, 'in_progress'],
  [hwMap['HW-FW-001'], 'Security Policy Update', 'Updated ACLs, reviewed firewall rules, removed deprecated rules', 'Security Team', 0.00, '2024-02-20', '2024-08-20', 'completed'],
  [hwMap['HW-ST-001'], 'Disk Expansion', 'Added 2x 8TB drives to expand storage pool to 32TB', 'IT Team', 480.00, '2024-01-10', '2025-01-10', 'completed'],
  [hwMap['HW-PR-001'], 'Scheduled Maintenance', 'Roller and fuser kit replacement - 120K pages', 'HP Service', 180.00, '2023-11-15', '2024-11-15', 'completed'],
  [hwMap['HW-UPS-001'], 'Battery Replacement', 'Replaced all 4 UPS battery modules - load test passed', 'APC Service', 650.00, '2023-12-10', '2026-12-10', 'completed'],
];
const insM = db.prepare('INSERT INTO maintenance_records (hardware_id,type,description,performed_by,cost,date,next_date,status) VALUES (?,?,?,?,?,?,?,?)');
maint.forEach(m => {
  if (m[0]) insM.run(...m);
});
console.log('Maintenance records seeded:', maint.length);

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM audit_logs').run();
const auditLogs = [
  [1, 'Super Admin', 'login', 'auth', null, 'User logged in successfully'],
  [1, 'Super Admin', 'create', 'software', 1, 'Created software asset: Microsoft Office 365'],
  [1, 'Super Admin', 'create', 'hardware', 1, 'Created hardware asset: Dell XPS 15 Laptop (HW-LT-001)'],
  [2, 'IT Manager', 'login', 'auth', null, 'User logged in successfully'],
  [2, 'IT Manager', 'update', 'software', 9, 'Updated license count for Slack Business+'],
  [3, 'IT Admin', 'create', 'license', 1, 'Added license: M365-EA-2023-001 (300 seats)'],
  [3, 'IT Admin', 'connect', 'integration', 1, 'Connected integration: Microsoft 365'],
  [3, 'IT Admin', 'sync', 'integration', 1, 'Synced Microsoft 365 - 500 licenses discovered'],
  [4, 'Asset Manager', 'create', 'hardware', 11, 'Created hardware asset: HP ProDesk 600 G9 (HW-DT-001)'],
  [4, 'Asset Manager', 'update', 'hardware', 7, 'Updated status of ThinkPad L15 to in_repair'],
  [1, 'Super Admin', 'create', 'contract', 1, 'Created contract: Microsoft Enterprise Agreement FY2023-2025'],
  [2, 'IT Manager', 'create', 'vendor', 1, 'Added vendor: Microsoft Corporation'],
  [3, 'IT Admin', 'connect', 'integration', 7, 'Connected integration: Slack'],
  [3, 'IT Admin', 'connect', 'integration', 12, 'Connected integration: Okta'],
  [1, 'Super Admin', 'create', 'user', 5, 'Created user account: John Smith'],
  [2, 'IT Manager', 'update', 'contract', 13, 'Updated contract status: HP Equipment Maintenance - expiring_soon'],
  [3, 'IT Admin', 'create', 'maintenance', 1, 'Logged maintenance: HW-SV-001 Preventive Maintenance'],
  [4, 'Asset Manager', 'update', 'hardware', 3, 'Assigned Lenovo ThinkPad to IT Manager'],
  [2, 'IT Manager', 'sync', 'integration', 2, 'Synced Google Workspace - 250 licenses discovered'],
  [1, 'Super Admin', 'update', 'software', 23, 'Updated CrowdStrike Falcon used licenses: 412'],
];
const insA = db.prepare("INSERT INTO audit_logs (user_id,user_name,action,resource_type,resource_id,details,created_at) VALUES (?,?,?,?,?,?,datetime('now','-' || ? || ' hours'))");
auditLogs.forEach((l, i) => insA.run(l[0], l[1], l[2], l[3], l[4], l[5], i * 3));
console.log('Audit logs seeded:', auditLogs.length);

// Final count
const tables = ['users','software_assets','hardware_assets','licenses','cloud_integrations','vendors','contracts','audit_logs','maintenance_records'];
console.log('\n=== FINAL COUNTS ===');
tables.forEach(t => {
  const count = db.prepare('SELECT COUNT(*) as c FROM ' + t).get().c;
  console.log(' ' + t + ': ' + count);
});
console.log('\nAll sample data seeded successfully!');
