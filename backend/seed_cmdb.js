const { getDb, initDatabase } = require('./database/init');

initDatabase();
const db = getDb();

// Clear existing CMDB data
db.prepare('DELETE FROM cmdb_relationships').run();
db.prepare('DELETE FROM cmdb_items').run();

const items = [
  // Servers
  ['CI-00001', 'Primary Web Server', 'Server', 'Web Server', 'active', 'production', 'critical', 'IT Operations', 'IT', 'Data Center - Rack A1', '10.0.1.10', 'Ubuntu 22.04 LTS', '22.04', 'Primary application web server handling all HTTP traffic', 'DevOps Team'],
  ['CI-00002', 'Database Server (Primary)', 'Server', 'Database', 'active', 'production', 'critical', 'DBA Team', 'IT', 'Data Center - Rack A2', '10.0.1.20', 'Windows Server 2022', '21H2', 'Primary MS SQL Server 2022 database cluster node', 'DBA Team'],
  ['CI-00003', 'Database Server (Replica)', 'Server', 'Database', 'active', 'production', 'high', 'DBA Team', 'IT', 'Data Center - Rack A3', '10.0.1.21', 'Windows Server 2022', '21H2', 'Read replica for primary database, failover target', 'DBA Team'],
  ['CI-00004', 'File Server', 'Server', 'Storage', 'active', 'production', 'high', 'IT Operations', 'IT', 'Data Center - Rack B1', '10.0.1.30', 'Windows Server 2022', '21H2', 'Enterprise file storage and backup server', 'IT Operations'],
  ['CI-00005', 'Mail Server', 'Server', 'Email', 'active', 'production', 'high', 'IT Operations', 'IT', 'Data Center - Rack B2', '10.0.1.40', 'Windows Server 2019', '1809', 'Microsoft Exchange Server 2019', 'IT Operations'],
  ['CI-00006', 'DR Web Server', 'Server', 'Web Server', 'active', 'dr', 'high', 'IT Operations', 'IT', 'DR Site - Rack C1', '10.1.1.10', 'Ubuntu 22.04 LTS', '22.04', 'Disaster Recovery web server, hot standby', 'DevOps Team'],
  ['CI-00007', 'Build / CI Server', 'Server', 'CI/CD', 'active', 'production', 'medium', 'DevOps Team', 'Engineering', 'Data Center - Rack D1', '10.0.1.50', 'Ubuntu 20.04 LTS', '20.04', 'Jenkins CI/CD build server', 'DevOps Team'],
  ['CI-00008', 'Monitoring Server', 'Server', 'Monitoring', 'active', 'production', 'medium', 'IT Operations', 'IT', 'Data Center - Rack D2', '10.0.1.60', 'Ubuntu 22.04 LTS', '22.04', 'Prometheus + Grafana monitoring stack', 'IT Operations'],
  // Network
  ['CI-00009', 'Core Network Switch', 'Network', 'Switch', 'active', 'production', 'critical', 'Network Team', 'IT', 'Data Center - Rack E1', '10.0.0.1', 'IOS-XE', '17.9', 'Cisco Catalyst 9300 core switching layer', 'Network Team'],
  ['CI-00010', 'Edge Firewall (Primary)', 'Network', 'Firewall', 'active', 'production', 'critical', 'Security Team', 'IT', 'Data Center - Rack E2', '10.0.0.2', 'ASA OS', '9.16', 'Cisco ASA 5506-X primary perimeter firewall', 'Security Team'],
  ['CI-00011', 'Load Balancer', 'Network', 'Load Balancer', 'active', 'production', 'critical', 'Network Team', 'IT', 'Data Center - Rack E3', '10.0.0.5', 'F5 BIG-IP', '16.1', 'F5 BIG-IP application delivery controller', 'Network Team'],
  ['CI-00012', 'VPN Gateway', 'Network', 'VPN', 'active', 'production', 'high', 'Security Team', 'IT', 'Data Center - Rack F1', '10.0.0.10', 'Cisco IOS', '15.9', 'Remote access VPN concentrator', 'Security Team'],
  // Applications
  ['CI-00013', 'ERP System', 'Application', 'ERP', 'active', 'production', 'critical', 'IT Manager', 'IT', null, null, null, 'v4.2', 'SAP S/4HANA enterprise resource planning system', 'SAP Basis Team'],
  ['CI-00014', 'CRM Platform', 'Application', 'CRM', 'active', 'production', 'high', 'Sales Ops', 'Sales', null, null, null, 'Spring 24', 'Salesforce CRM managing customer relationships', 'Salesforce Admin'],
  ['CI-00015', 'ITSM Tool', 'Application', 'ITSM', 'active', 'production', 'high', 'IT Operations', 'IT', null, null, null, 'San Diego', 'ServiceNow IT Service Management platform', 'IT Operations'],
  ['CI-00016', 'HR Information System', 'Application', 'HRIS', 'active', 'production', 'high', 'HR Manager', 'HR', null, null, null, '12.0', 'Workday HCM human capital management', 'HR Team'],
  ['CI-00017', 'Identity Provider (Okta)', 'Application', 'IAM', 'active', 'production', 'critical', 'Security Team', 'IT', null, null, null, '2024.01', 'Okta SSO and MFA identity platform', 'Security Team'],
  ['CI-00018', 'Git Repository Service', 'Application', 'Source Control', 'active', 'production', 'high', 'DevOps Team', 'Engineering', null, null, null, 'Enterprise 3.12', 'GitHub Enterprise source control platform', 'DevOps Team'],
  ['CI-00019', 'Project Management (Jira)', 'Application', 'Project Mgmt', 'active', 'production', 'medium', 'PMO', 'Engineering', null, null, null, '9.12', 'Atlassian Jira Software project tracking', 'DevOps Team'],
  ['CI-00020', 'Communication Platform', 'Application', 'Messaging', 'active', 'production', 'medium', 'IT Operations', 'All Departments', null, null, null, '4.35', 'Slack team communication and collaboration', 'IT Operations'],
  // Virtual Machines
  ['CI-00021', 'VM - API Gateway', 'Virtual Machine', 'API', 'active', 'production', 'critical', 'DevOps Team', 'Engineering', 'AWS us-east-1', '10.0.2.1', 'Amazon Linux 2', '2023.3', 'AWS EC2 t3.large — Kong API Gateway', 'DevOps Team'],
  ['CI-00022', 'VM - Microservice Cluster', 'Virtual Machine', 'Container', 'active', 'production', 'high', 'DevOps Team', 'Engineering', 'AWS us-east-1', null, 'Amazon EKS', '1.29', 'Kubernetes cluster running 12 microservices', 'DevOps Team'],
  ['CI-00023', 'VM - Staging Environment', 'Virtual Machine', 'Application', 'active', 'staging', 'medium', 'QA Team', 'Engineering', 'AWS us-east-1', '10.0.3.1', 'Ubuntu 22.04 LTS', '22.04', 'Staging environment mirrors production configuration', 'DevOps Team'],
  ['CI-00024', 'VM - Dev Environment', 'Virtual Machine', 'Application', 'active', 'development', 'low', 'Development Team', 'Engineering', 'Azure East US', '10.0.4.1', 'Ubuntu 20.04 LTS', '20.04', 'Shared development environment for engineering team', 'DevOps Team'],
  // Storage
  ['CI-00025', 'NAS Storage Array', 'Storage', 'NAS', 'active', 'production', 'high', 'IT Operations', 'IT', 'Data Center - Rack G1', '10.0.1.70', 'NetApp ONTAP', '9.14', 'NetApp AFF A400 all-flash NAS array, 100TB capacity', 'Storage Team'],
  ['CI-00026', 'Backup Storage (Veeam)', 'Storage', 'Backup', 'active', 'production', 'high', 'IT Operations', 'IT', 'Data Center - Rack G2', '10.0.1.71', 'Windows Server 2022', '21H2', 'Veeam Backup & Replication server with 50TB capacity', 'IT Operations'],
  // Services
  ['CI-00027', 'DNS Service', 'Service', 'DNS', 'active', 'production', 'critical', 'Network Team', 'IT', 'Data Center', '10.0.0.53', 'Windows Server 2022', '21H2', 'Active Directory DNS service', 'Network Team'],
  ['CI-00028', 'Active Directory', 'Service', 'Directory', 'active', 'production', 'critical', 'IT Operations', 'IT', 'Data Center - Rack H1', '10.0.0.100', 'Windows Server 2022', '21H2', 'Microsoft Active Directory domain controller', 'IT Operations'],
  ['CI-00029', 'Email Gateway (Proofpoint)', 'Service', 'Email Security', 'active', 'production', 'high', 'Security Team', 'IT', 'Cloud', null, 'Proofpoint Cloud', '2024.1', 'Email security filtering and anti-spam gateway', 'Security Team'],
  ['CI-00030', 'CDN Service (Cloudflare)', 'Service', 'CDN', 'active', 'production', 'high', 'DevOps Team', 'IT', 'Global', null, 'Cloudflare', '2024', 'Cloudflare CDN and DDoS protection for public-facing apps', 'DevOps Team'],
];

const insert = db.prepare(`
  INSERT INTO cmdb_items (ci_id, name, type, category, status, environment, criticality, owner, department, location, ip_address, os, version, description, managed_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertTx = db.transaction(() => {
  for (const item of items) {
    insert.run(...item);
  }
});
insertTx();

// Now seed relationships
const relData = [
  // Web server depends on load balancer
  [1, 11, 'connected_to', 'Web traffic routed through F5 load balancer'],
  // Web server depends on DB
  [1, 2, 'depends_on', 'Application tier reads/writes to primary database'],
  // Web server uses Okta for auth
  [1, 17, 'depends_on', 'User authentication via Okta SSO'],
  // DB primary -> replica
  [2, 3, 'replicates_to', 'Synchronous replication to read replica'],
  // DB server uses NAS for storage
  [2, 25, 'uses', 'Database files stored on NAS array'],
  // File server uses NAS
  [4, 25, 'uses', 'File shares backed by NAS storage array'],
  // Backup covers servers
  [26, 2, 'backs_up', 'Nightly backup of primary database'],
  [26, 4, 'backs_up', 'Daily backup of file server'],
  // Mail server -> email gateway
  [5, 29, 'connected_to', 'Inbound/outbound mail filtered through Proofpoint'],
  // Firewall -> core switch
  [10, 9, 'connected_to', 'Perimeter firewall upstream of core switch'],
  // Load balancer -> firewall
  [11, 10, 'behind', 'Load balancer sits behind perimeter firewall'],
  // VPN -> firewall
  [12, 10, 'connected_to', 'VPN traffic enters through firewall'],
  // API gateway -> microservices
  [21, 22, 'routes_to', 'API gateway routes requests to microservice cluster'],
  // Microservices -> DB
  [22, 2, 'depends_on', 'Microservices connect to primary database'],
  // ERP -> DB
  [13, 2, 'depends_on', 'SAP S/4HANA database hosted on primary DB server'],
  // CRM -> Okta
  [14, 17, 'authenticates_via', 'Salesforce SSO integrated with Okta'],
  // ITSM -> AD
  [15, 28, 'authenticates_via', 'ServiceNow integrated with Active Directory'],
  // HRIS -> Okta
  [16, 17, 'authenticates_via', 'Workday SSO via Okta'],
  // Git -> CI server
  [18, 7, 'triggers', 'GitHub webhooks trigger Jenkins builds'],
  // CI server -> staging
  [7, 23, 'deploys_to', 'Jenkins pipelines deploy to staging environment'],
  // Staging -> DR server
  [23, 6, 'mirrors', 'Staging config mirrors DR environment'],
  // DNS -> AD
  [27, 28, 'integrated_with', 'DNS integrated with Active Directory'],
  // Monitoring -> all servers
  [8, 1, 'monitors', 'Prometheus scrapes metrics from web server'],
  [8, 2, 'monitors', 'Database health monitored by Grafana stack'],
  [8, 9, 'monitors', 'Network switch SNMP monitored'],
  // CDN -> web server
  [30, 1, 'fronts', 'Cloudflare CDN caches and proxies to web server'],
];

const insertRel = db.prepare('INSERT INTO cmdb_relationships (source_ci_id, target_ci_id, relationship_type, description) VALUES (?, ?, ?, ?)');
const relTx = db.transaction(() => {
  for (const r of relData) {
    insertRel.run(...r);
  }
});
relTx();

console.log(`✅ CMDB seeded: ${items.length} configuration items, ${relData.length} relationships`);
