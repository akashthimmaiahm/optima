import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Zap, Settings, Info, Key, Globe, Users, Shield, AlertCircle, ChevronDown, ChevronUp, Plus, Search, BookOpen, ExternalLink, Trash2, HelpCircle, MapPin } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

// ── AWS Regions ──────────────────────────────────────────────────────────────
const AWS_REGIONS = [
  { value: 'all',            label: 'All Regions' },
  { value: 'us-east-1',     label: 'US East (N. Virginia)' },
  { value: 'us-east-2',     label: 'US East (Ohio)' },
  { value: 'us-west-1',     label: 'US West (N. California)' },
  { value: 'us-west-2',     label: 'US West (Oregon)' },
  { value: 'af-south-1',    label: 'Africa (Cape Town)' },
  { value: 'ap-east-1',     label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1',    label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-south-2',    label: 'Asia Pacific (Hyderabad)' },
  { value: 'ap-southeast-1',label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2',label: 'Asia Pacific (Sydney)' },
  { value: 'ap-southeast-3',label: 'Asia Pacific (Jakarta)' },
  { value: 'ap-northeast-1',label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2',label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3',label: 'Asia Pacific (Osaka)' },
  { value: 'ca-central-1',  label: 'Canada (Central)' },
  { value: 'eu-central-1',  label: 'Europe (Frankfurt)' },
  { value: 'eu-central-2',  label: 'Europe (Zurich)' },
  { value: 'eu-west-1',     label: 'Europe (Ireland)' },
  { value: 'eu-west-2',     label: 'Europe (London)' },
  { value: 'eu-west-3',     label: 'Europe (Paris)' },
  { value: 'eu-south-1',    label: 'Europe (Milan)' },
  { value: 'eu-north-1',    label: 'Europe (Stockholm)' },
  { value: 'me-south-1',    label: 'Middle East (Bahrain)' },
  { value: 'me-central-1',  label: 'Middle East (UAE)' },
  { value: 'sa-east-1',     label: 'South America (Sao Paulo)' },
]

// ── Full catalog of supported cloud applications ──────────────────────────────
const APP_CATALOG = [
  {
    key: 'microsoft_365', name: 'Microsoft 365', provider: 'Microsoft', type: 'productivity',
    emoji: '🔷', color: 'bg-blue-100 dark:bg-blue-900/30',
    description: 'Sync users, licenses, and subscriptions from Microsoft 365 via Microsoft Graph API.',
    auth_type: 'oauth2', api_endpoint: 'https://graph.microsoft.com/v1.0',
    setup: 'Azure Portal → App registrations → New registration → API permissions (User.Read.All, Directory.Read.All)',
    help: [
      'Go to portal.azure.com and sign in with your admin account.',
      'Navigate to Azure Active Directory → App registrations → New registration.',
      'Name it "Optima ITAM" and set the redirect URI to your Optima server URL.',
      'After creation, copy the Application (Client) ID from the overview page.',
      'Go to Certificates & secrets → New client secret → Copy the secret value immediately.',
      'Go to API permissions → Add → Microsoft Graph → Application permissions.',
      'Add: User.Read.All, Directory.Read.All, Organization.Read.All.',
      'Click "Grant admin consent" for all permissions.',
      'Copy the Tenant ID from Azure Active Directory → Overview.',
    ],
    fields: [
      { key: 'client_id',     label: 'Application (Client) ID', placeholder: '00000000-0000-0000-0000-000000000000', required: true },
      { key: 'client_secret', label: 'Client Secret Value',     placeholder: 'Paste the secret value (not the ID)', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Tenant ID / Domain',      placeholder: 'contoso.onmicrosoft.com or GUID', required: true },
    ],
  },
  {
    key: 'google_workspace', name: 'Google Workspace', provider: 'Google', type: 'productivity',
    emoji: '🔵', color: 'bg-red-50 dark:bg-red-900/20',
    description: 'Discover users, licenses, and devices across your Google Workspace organization.',
    auth_type: 'service_account', api_endpoint: 'https://admin.googleapis.com',
    setup: 'Google Cloud Console → IAM → Service Accounts → Create key (JSON) → Enable Admin SDK API',
    help: [
      'Go to console.cloud.google.com and create a new project (or select existing).',
      'Navigate to APIs & Services → Enable APIs → Search "Admin SDK API" → Enable it.',
      'Go to IAM & Admin → Service Accounts → Create Service Account.',
      'Name it "optima-itam" and grant it the "Viewer" role.',
      'Click the service account → Keys → Add Key → Create new key → JSON.',
      'Download the JSON key file — you will paste its contents in the configuration.',
      'Go to admin.google.com → Security → API Controls → Domain-wide delegation.',
      'Add the service account Client ID with scopes: https://www.googleapis.com/auth/admin.directory.user.readonly, https://www.googleapis.com/auth/admin.directory.domain.readonly.',
      'Enter your Google Workspace primary domain (e.g. yourcompany.com).',
    ],
    fields: [
      { key: 'client_id',     label: 'Service Account Email', placeholder: 'sa@project.iam.gserviceaccount.com', required: true },
      { key: 'client_secret', label: 'Service Account Key (JSON)', placeholder: 'Paste full JSON key contents', type: 'textarea', required: true },
      { key: 'tenant_id',     label: 'Google Workspace Domain', placeholder: 'yourcompany.com', required: true },
    ],
  },
  {
    key: 'salesforce', name: 'Salesforce CRM', provider: 'Salesforce', type: 'crm',
    emoji: '☁️', color: 'bg-sky-50 dark:bg-sky-900/20',
    description: 'Connect Salesforce to track user licenses, permission sets, and active subscriptions.',
    auth_type: 'oauth2', api_endpoint: 'https://login.salesforce.com/services/oauth2',
    setup: 'Salesforce Setup → App Manager → New Connected App → Enable OAuth (api, refresh_token scopes)',
    help: [
      'Log in to Salesforce as an administrator.',
      'Go to Setup → Apps → App Manager → New Connected App.',
      'Set the app name to "Optima ITAM" and provide a contact email.',
      'Check "Enable OAuth Settings" and set the callback URL to your Optima server.',
      'Select OAuth scopes: "api", "refresh_token", "offline_access".',
      'Save and wait 2-10 minutes for the app to activate.',
      'Copy the Consumer Key (Client ID) and Consumer Secret.',
      'Your Instance URL is your Salesforce domain (e.g. https://yourorg.my.salesforce.com).',
    ],
    fields: [
      { key: 'client_id',     label: 'Consumer Key',    placeholder: 'Salesforce Connected App consumer key', required: true },
      { key: 'client_secret', label: 'Consumer Secret', placeholder: 'Consumer secret', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Instance URL',    placeholder: 'https://yourorg.my.salesforce.com', required: true },
    ],
  },
  {
    key: 'aws_iam', name: 'AWS IAM', provider: 'Amazon', type: 'cloud',
    emoji: '🟠', color: 'bg-orange-50 dark:bg-orange-900/20',
    description: 'Enumerate IAM users, roles, policies, EC2 instances, and resources across your AWS account.',
    auth_type: 'api_key', api_endpoint: 'https://iam.amazonaws.com',
    setup: 'AWS Console → IAM → Users → Create user → Attach ReadOnlyAccess policy → Create access key',
    help: [
      'Sign in to the AWS Management Console at console.aws.amazon.com.',
      'Navigate to IAM → Users → Create user.',
      'Name it "optima-readonly" and select "Programmatic access".',
      'Attach the "ReadOnlyAccess" managed policy (or create a custom policy with iam:List*, iam:Get*, ec2:Describe*, organizations:List* permissions).',
      'After creating the user, go to Security credentials → Create access key.',
      'Select "Third-party service" as the use case.',
      'Copy the Access Key ID and Secret Access Key (shown only once).',
      'Select a region or choose "All Regions" to scan resources across every AWS region.',
      'For multi-account setups, use AWS Organizations with a cross-account IAM role.',
    ],
    fields: [
      { key: 'api_key',       label: 'Access Key ID',     placeholder: 'AKIAIOSFODNN7EXAMPLE', required: true },
      { key: 'client_secret', label: 'Secret Access Key', placeholder: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', type: 'password', required: true },
      { key: 'region',        label: 'AWS Region',        type: 'aws_region', required: true },
    ],
  },
  {
    key: 'azure', name: 'Microsoft Azure', provider: 'Microsoft', type: 'cloud',
    emoji: '🔷', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Discover Azure subscriptions, VMs, resource groups, and cost data.',
    auth_type: 'oauth2', api_endpoint: 'https://management.azure.com',
    setup: 'Azure Portal → App registrations → New registration → Certificates & secrets → Subscription → Access control (IAM) → Reader role',
    help: [
      'Go to portal.azure.com and sign in as an administrator.',
      'Navigate to Azure Active Directory → App registrations → New registration.',
      'Name it "Optima Azure Monitor" with single-tenant access.',
      'Copy the Application (Client) ID and Directory (Tenant) ID from the overview.',
      'Go to Certificates & secrets → New client secret → Copy the value.',
      'Navigate to the target Subscription → Access control (IAM) → Add role assignment.',
      'Assign "Reader" role to the app registration you just created.',
      'For cost data, also assign "Cost Management Reader" role.',
      'Repeat IAM role assignment for each subscription you want to monitor.',
    ],
    fields: [
      { key: 'client_id',     label: 'Application (Client) ID', placeholder: 'Azure AD app client ID', required: true },
      { key: 'client_secret', label: 'Client Secret',           placeholder: 'App registration secret value', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Tenant ID',               placeholder: 'Azure AD tenant GUID', required: true },
    ],
  },
  {
    key: 'gcp', name: 'Google Cloud Platform', provider: 'Google', type: 'cloud',
    emoji: '🔵', color: 'bg-yellow-50 dark:bg-yellow-900/20',
    description: 'Scan GCP projects, compute instances, and billing data.',
    auth_type: 'service_account', api_endpoint: 'https://cloudresourcemanager.googleapis.com',
    setup: 'GCP Console → IAM → Service Accounts → Create → Viewer role → Create JSON key',
    help: [
      'Go to console.cloud.google.com and select or create a project.',
      'Navigate to IAM & Admin → Service Accounts → Create Service Account.',
      'Name it "optima-itam" and grant it the "Viewer" role at the project level.',
      'For organization-wide scanning, grant "Organization Viewer" at org level.',
      'Click the service account → Keys → Add Key → JSON → Download.',
      'Enable the following APIs: Cloud Resource Manager, Compute Engine, Cloud Billing.',
      'Paste the entire JSON key file contents in the configuration field.',
      'Enter the GCP Project ID (found on the project dashboard).',
    ],
    fields: [
      { key: 'client_id',     label: 'Service Account Email', placeholder: 'sa@project.iam.gserviceaccount.com', required: true },
      { key: 'client_secret', label: 'Service Account Key (JSON)', placeholder: 'Paste full JSON key contents', type: 'textarea', required: true },
      { key: 'tenant_id',     label: 'GCP Project ID', placeholder: 'my-gcp-project-123', required: true },
    ],
  },
  {
    key: 'slack', name: 'Slack', provider: 'Salesforce', type: 'communication',
    emoji: '💬', color: 'bg-purple-50 dark:bg-purple-900/20',
    description: 'Sync Slack workspace members, channels, and subscription tier details.',
    auth_type: 'oauth2', api_endpoint: 'https://slack.com/api',
    setup: 'api.slack.com → Your Apps → Create New App → OAuth & Permissions → users:read, admin scopes',
    help: [
      'Go to api.slack.com/apps and click "Create New App" → "From scratch".',
      'Name it "Optima ITAM" and select your workspace.',
      'Go to OAuth & Permissions → Add Bot Token Scopes: users:read, users:read.email, team:read, admin.teams:read.',
      'Install the app to your workspace and authorize.',
      'Copy the Bot User OAuth Token (starts with xoxb-).',
      'Copy the Client ID and Client Secret from Basic Information.',
      'The bot token provides read-only access to workspace member data.',
    ],
    fields: [
      { key: 'client_id',     label: 'Client ID',     placeholder: 'Slack OAuth client ID', required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Slack OAuth client secret', type: 'password', required: true },
      { key: 'api_key',       label: 'Bot/User OAuth Token', placeholder: 'xoxb-... or xoxp-...', required: true },
    ],
  },
  {
    key: 'zoom', name: 'Zoom', provider: 'Zoom', type: 'communication',
    emoji: '🎥', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Pull Zoom users, license types, and meeting usage statistics.',
    auth_type: 'oauth2', api_endpoint: 'https://api.zoom.us/v2',
    setup: 'marketplace.zoom.us → Develop → Build App → Server-to-Server OAuth → Account Management permission',
    help: [
      'Go to marketplace.zoom.us and sign in as an admin.',
      'Click Develop → Build App → Server-to-Server OAuth.',
      'Name the app "Optima ITAM" and copy the Account ID.',
      'Copy the Client ID and Client Secret from the app credentials.',
      'Go to Scopes → Add: user:read:list_users:admin, account:read:admin.',
      'Activate the app.',
      'The Account ID goes in the first field, Client ID in the second.',
    ],
    fields: [
      { key: 'client_id',     label: 'Account ID',    placeholder: 'Zoom Account ID', required: true },
      { key: 'api_key',       label: 'Client ID',     placeholder: 'Zoom OAuth Client ID', required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Zoom OAuth Client Secret', type: 'password', required: true },
    ],
  },
  {
    key: 'github', name: 'GitHub Enterprise', provider: 'Microsoft', type: 'development',
    emoji: '🐙', color: 'bg-gray-50 dark:bg-gray-800/50',
    description: 'Enumerate GitHub organization members, repos, and seat usage.',
    auth_type: 'api_key', api_endpoint: 'https://api.github.com',
    setup: 'GitHub → Settings → Developer settings → Personal access tokens (Classic) → read:org, read:user scopes',
    help: [
      'Go to github.com → Your profile → Settings → Developer settings.',
      'Click Personal access tokens → Tokens (classic) → Generate new token.',
      'Name it "Optima ITAM" and set an expiration (90 days recommended).',
      'Select scopes: read:org (read organization data), read:user (read user profiles).',
      'For GitHub Enterprise, also select admin:org for seat count data.',
      'Click "Generate token" and copy it immediately (shown only once).',
      'Enter your GitHub organization name (the URL slug, e.g. "my-company").',
    ],
    fields: [
      { key: 'api_key',   label: 'Personal Access Token', placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx', type: 'password', required: true },
      { key: 'tenant_id', label: 'Organization Name',     placeholder: 'your-org-name', required: true },
    ],
  },
  {
    key: 'jira', name: 'Jira Cloud', provider: 'Atlassian', type: 'project_management',
    emoji: '🔷', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Sync Jira Cloud users, projects, and license seat consumption.',
    auth_type: 'api_key', api_endpoint: 'https://your-domain.atlassian.net',
    setup: 'id.atlassian.com → Security → Create and manage API tokens → Read:jira-user scope',
    help: [
      'Go to id.atlassian.com → Security → Create and manage API tokens.',
      'Click "Create API token" and name it "Optima ITAM".',
      'Copy the generated token (shown only once).',
      'Use your Atlassian account email as the "Account Email".',
      'Enter your Jira instance URL (e.g. https://yourcompany.atlassian.net).',
      'The API token + email combination is used for Basic authentication.',
      'Ensure your account has admin access to view all users and licenses.',
    ],
    fields: [
      { key: 'client_id', label: 'Atlassian Account Email', placeholder: 'admin@yourcompany.com', required: true },
      { key: 'api_key',   label: 'API Token',               placeholder: 'Paste your Atlassian API token', type: 'password', required: true },
      { key: 'tenant_id', label: 'Jira Instance URL',       placeholder: 'https://yourcompany.atlassian.net', required: true },
    ],
  },
  {
    key: 'adobe', name: 'Adobe Creative Cloud', provider: 'Adobe', type: 'design',
    emoji: '🔴', color: 'bg-red-50 dark:bg-red-900/20',
    description: 'Discover Adobe CC licenses, product profiles, and user assignments.',
    auth_type: 'oauth2', api_endpoint: 'https://ims-na1.adobelogin.com/ims',
    setup: 'developer.adobe.com → Console → Create project → Add API → User Management API → Service Account (JWT)',
    help: [
      'Go to developer.adobe.com and sign in with your Adobe admin account.',
      'Click Console → Create new project → Add API.',
      'Select "User Management API" from the list.',
      'Choose "Service Account (JWT)" authentication.',
      'Generate a key pair or upload your own public key.',
      'Download the private key file for configuration.',
      'Copy the Client ID (API Key) and Client Secret from the project overview.',
      'Find your Organization ID in Adobe Admin Console → Settings → Identity.',
    ],
    fields: [
      { key: 'client_id',     label: 'Client ID (API Key)', placeholder: 'Adobe console Client ID', required: true },
      { key: 'client_secret', label: 'Client Secret',       placeholder: 'Adobe console Client secret', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Organization ID',     placeholder: 'Adobe Org ID (e.g. ABCD1234@AdobeOrg)', required: true },
    ],
  },
  {
    key: 'okta', name: 'Okta', provider: 'Okta', type: 'identity',
    emoji: '🔐', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Sync Okta users, groups, app assignments, and MFA status.',
    auth_type: 'api_key', api_endpoint: 'https://your-domain.okta.com/api/v1',
    setup: 'Okta Admin → Security → API → Tokens → Create token (Read-only Admin role recommended)',
    help: [
      'Sign in to your Okta Admin Console (yourcompany-admin.okta.com).',
      'Navigate to Security → API → Tokens tab.',
      'Click "Create Token" and name it "Optima ITAM".',
      'Copy the token value immediately (shown only once).',
      'The token inherits the permissions of the user who created it.',
      'Use a Read-only Admin account for minimum required access.',
      'Enter your Okta domain (e.g. https://yourcompany.okta.com).',
    ],
    fields: [
      { key: 'api_key',   label: 'API Token',      placeholder: 'Okta API token', type: 'password', required: true },
      { key: 'tenant_id', label: 'Okta Domain',    placeholder: 'https://yourcompany.okta.com', required: true },
    ],
  },
  {
    key: 'dropbox', name: 'Dropbox Business', provider: 'Dropbox', type: 'storage',
    emoji: '📦', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Pull Dropbox Business team member counts and storage usage.',
    auth_type: 'oauth2', api_endpoint: 'https://api.dropboxapi.com/2',
    setup: 'dropbox.com/developers → App Console → Create app → Team information permission → Generate access token',
    help: [
      'Go to dropbox.com/developers and sign in with your Dropbox Business admin.',
      'Click App Console → Create app.',
      'Select "Scoped access" and "Full Dropbox" access type.',
      'Name it "Optima ITAM" and create.',
      'Go to Permissions → Check "team_info.read" and "members.read".',
      'Go to Settings → Generate access token (for testing) or set up OAuth flow.',
      'Copy the access token. For production, use a long-lived refresh token.',
      'Team ID is optional — it is auto-detected from the token.',
    ],
    fields: [
      { key: 'api_key',   label: 'Access Token', placeholder: 'Dropbox long-lived access token', type: 'password', required: true },
      { key: 'tenant_id', label: 'Team ID',      placeholder: 'Dropbox Business team ID (optional)' },
    ],
  },
  {
    key: 'servicenow', name: 'ServiceNow', provider: 'ServiceNow', type: 'itsm',
    emoji: '🟢', color: 'bg-green-50 dark:bg-green-900/20',
    description: 'Integrate with ServiceNow to sync CMDB assets, users, and IT service records.',
    auth_type: 'api_key', api_endpoint: 'https://your-instance.service-now.com/api',
    setup: 'ServiceNow → System Security → Users → Create integration user → Assign itil role → Basic auth',
    help: [
      'Log in to your ServiceNow instance as an admin.',
      'Navigate to System Security → Users → New.',
      'Create a user named "optima_integration" with a strong password.',
      'Go to the user\'s Roles tab and add: itil, asset, cmdb_read.',
      'Optionally restrict the user to read-only tables via ACLs.',
      'Enter the instance URL (e.g. https://your-instance.service-now.com).',
      'Use the username and password as credentials in Optima.',
      'The REST API is enabled by default on ServiceNow instances.',
    ],
    fields: [
      { key: 'client_id',     label: 'Username',      placeholder: 'ServiceNow integration username', required: true },
      { key: 'client_secret', label: 'Password',      placeholder: 'Integration user password', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Instance URL',  placeholder: 'https://your-instance.service-now.com', required: true },
    ],
  },
  {
    key: 'intune', name: 'Microsoft Intune', provider: 'Microsoft', type: 'endpoint_management',
    emoji: '🔷', color: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Sync enrolled devices, compliance status, and app deployments from Microsoft Intune.',
    auth_type: 'oauth2', api_endpoint: 'https://graph.microsoft.com/v1.0/deviceManagement',
    setup: 'Azure Portal → App registrations → API permissions → DeviceManagementManagedDevices.Read.All',
    help: [
      'Go to portal.azure.com → Azure Active Directory → App registrations.',
      'Register a new app or reuse your Microsoft 365 app registration.',
      'Go to API permissions → Add → Microsoft Graph → Application permissions.',
      'Add: DeviceManagementManagedDevices.Read.All, DeviceManagementConfiguration.Read.All.',
      'Click "Grant admin consent" for the organization.',
      'Go to Certificates & secrets → Create a new client secret.',
      'Copy Application (Client) ID, Client Secret, and Tenant ID.',
      'If reusing the M365 app, just add the Intune permissions — same credentials work.',
    ],
    fields: [
      { key: 'client_id',     label: 'Application (Client) ID', placeholder: 'Azure AD app client ID', required: true },
      { key: 'client_secret', label: 'Client Secret',           placeholder: 'App registration secret value', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Tenant ID',               placeholder: 'Azure AD tenant GUID', required: true },
    ],
  },
  {
    key: 'crowdstrike', name: 'CrowdStrike Falcon', provider: 'CrowdStrike', type: 'security',
    emoji: '🛡️', color: 'bg-red-50 dark:bg-red-900/20',
    description: 'Pull endpoint agent status, device counts, and detection summaries from Falcon.',
    auth_type: 'api_key', api_endpoint: 'https://api.crowdstrike.com',
    setup: 'Falcon Console → Support → API Clients → Create API client → Hosts: Read scope',
    help: [
      'Sign in to the CrowdStrike Falcon console.',
      'Navigate to Support → API Clients and Keys.',
      'Click "Add new API client" and name it "Optima ITAM".',
      'Select the scope: Hosts → Read (minimum required).',
      'Optionally add: Detections → Read, Prevention Policies → Read.',
      'Copy the Client ID and Client Secret after creation.',
      'Select your CrowdStrike cloud region (e.g. us-1, us-2, eu-1, us-gov-1).',
      'The API base URL varies by region (api.crowdstrike.com for US-1).',
    ],
    fields: [
      { key: 'client_id',     label: 'Client ID',     placeholder: 'CrowdStrike API client ID', required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'CrowdStrike API client secret', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Cloud Region',  placeholder: 'e.g. us-2.crowdstrike.com', required: true },
    ],
  },
  {
    key: 'datadog', name: 'Datadog', provider: 'Datadog', type: 'monitoring',
    emoji: '📊', color: 'bg-purple-50 dark:bg-purple-900/20',
    description: 'Pull host counts, agent coverage, and infrastructure metrics from Datadog.',
    auth_type: 'api_key', api_endpoint: 'https://api.datadoghq.com/api/v1',
    setup: 'Datadog → Organization Settings → API Keys → Create key; Scopes: metrics_read, infrastructure_read',
    help: [
      'Log in to your Datadog account.',
      'Go to Organization Settings → API Keys → New Key.',
      'Name the key "Optima ITAM" and copy it.',
      'Go to Organization Settings → Application Keys → New Key.',
      'Name it "Optima ITAM" and copy the Application Key.',
      'If you use a regional Datadog site, enter the site URL (e.g. us3.datadoghq.com).',
      'The API Key goes in the first field, Application Key in the second.',
    ],
    fields: [
      { key: 'api_key',   label: 'API Key',         placeholder: 'Datadog API key', type: 'password', required: true },
      { key: 'client_id', label: 'Application Key', placeholder: 'Datadog application key', required: true },
      { key: 'tenant_id', label: 'Site Region',     placeholder: 'e.g. us3.datadoghq.com' },
    ],
  },
  {
    key: 'workday', name: 'Workday', provider: 'Workday', type: 'hr',
    emoji: '👥', color: 'bg-yellow-50 dark:bg-yellow-900/20',
    description: 'Sync employee headcount, departments, and HR seat data from Workday.',
    auth_type: 'oauth2', api_endpoint: 'https://wd2-impl-services1.workday.com/ccx/api',
    setup: 'Workday → System → Integration System → Create Integration System User → Assign security policy',
    help: [
      'Sign in to Workday as a Security Administrator.',
      'Navigate to System menu → Integration System → Create Integration System User.',
      'Set a username and password for the integration user.',
      'Go to Security → Assign Security Policy → Create security group for API access.',
      'Add the integration user to the security group.',
      'Grant the group: Get_Workers, Get_Organizations read access.',
      'Copy the Client ID and Client Secret from the API Client registration.',
      'Enter your Workday tenant name (found in the URL after "wd5.myworkday.com/").',
    ],
    fields: [
      { key: 'client_id',     label: 'Client ID',     placeholder: 'Workday OAuth client ID', required: true },
      { key: 'client_secret', label: 'Client Secret', placeholder: 'Workday OAuth client secret', type: 'password', required: true },
      { key: 'tenant_id',     label: 'Tenant / Instance', placeholder: 'Workday tenant name', required: true },
    ],
  },
]

const providerMeta = {
  Microsoft:  { emoji: '🔷', color: 'bg-blue-100 dark:bg-blue-900/30' },
  Google:     { emoji: '🔵', color: 'bg-red-50 dark:bg-red-900/20' },
  Salesforce: { emoji: '☁️', color: 'bg-sky-50 dark:bg-sky-900/20' },
  Amazon:     { emoji: '🟠', color: 'bg-orange-50 dark:bg-orange-900/20' },
  Atlassian:  { emoji: '🔷', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Adobe:      { emoji: '🔴', color: 'bg-red-50 dark:bg-red-900/20' },
  Okta:       { emoji: '🔐', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Dropbox:    { emoji: '📦', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Zoom:       { emoji: '🎥', color: 'bg-blue-50 dark:bg-blue-900/20' },
  ServiceNow: { emoji: '🟢', color: 'bg-green-50 dark:bg-green-900/20' },
  CrowdStrike:{ emoji: '🛡️', color: 'bg-red-50 dark:bg-red-900/20' },
  Datadog:    { emoji: '📊', color: 'bg-purple-50 dark:bg-purple-900/20' },
  Workday:    { emoji: '👥', color: 'bg-yellow-50 dark:bg-yellow-900/20' },
}

const typeColors = {
  productivity: 'blue', crm: 'success', cloud: 'purple', communication: 'info',
  development: 'warning', identity: 'purple', storage: 'default', itsm: 'default',
  design: 'danger', project_management: 'warning', endpoint_management: 'info',
  security: 'danger', monitoring: 'purple', hr: 'success',
}

const syncOptions = ['realtime', 'hourly', 'daily', 'weekly']

const authTypeLabels = { oauth2: 'OAuth 2.0', api_key: 'API Key', service_account: 'Service Account' }

// Fallback generic fields when no catalog entry found
const genericFields = {
  oauth2:          [
    { key: 'client_id',     label: 'Client ID',       placeholder: 'OAuth Client ID', required: true },
    { key: 'client_secret', label: 'Client Secret',   placeholder: 'OAuth Client Secret', type: 'password', required: true },
    { key: 'tenant_id',     label: 'Tenant / Domain', placeholder: 'Tenant or domain' },
  ],
  api_key:         [
    { key: 'api_key',   label: 'API Key / Token', placeholder: 'Enter API key', type: 'password', required: true },
    { key: 'tenant_id', label: 'Domain / Instance URL', placeholder: 'e.g. yourcompany.atlassian.net' },
  ],
  service_account: [
    { key: 'client_id',     label: 'Service Account Email', placeholder: 'sa@project.iam.gserviceaccount.com', required: true },
    { key: 'client_secret', label: 'Private Key (JSON)',     placeholder: 'Paste service account JSON key', type: 'textarea', required: true },
    { key: 'tenant_id',     label: 'Project / Domain ID',   placeholder: 'your-project-id' },
  ],
}

function ConfigModal({ integration, mode, onClose, onSaved }) {
  const isConnect = mode === 'connect'
  const existing = integration?.config || {}

  // Find catalog entry for this integration to get field definitions
  const catalogEntry = APP_CATALOG.find(a =>
    a.name.toLowerCase() === integration?.name?.toLowerCase() ||
    a.key === integration?.catalog_key
  )
  const catalogFields = catalogEntry?.fields

  const [form, setForm] = useState({
    auth_type:      integration?.auth_type || catalogEntry?.auth_type || 'oauth2',
    client_id:      integration?.client_id || '',
    tenant_id:      integration?.tenant_id || '',
    api_endpoint:   integration?.api_endpoint || catalogEntry?.api_endpoint || '',
    sync_frequency: integration?.sync_frequency || 'daily',
    client_secret:  existing.client_secret || '',
    api_key:        existing.api_key || '',
    scopes:         existing.scopes || '',
    webhook_url:    existing.webhook_url || '',
    region:         existing.region || '',
    instance_url:   existing.instance_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  const fields = catalogFields || genericFields[form.auth_type] || genericFields.oauth2
  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const endpoint = isConnect
        ? `/integrations/${integration.id}/connect`
        : `/integrations/${integration.id}/configure`
      await api.put(endpoint, form)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save configuration')
    } finally { setSaving(false) }
  }

  const meta = providerMeta[integration?.provider] || { emoji: '🔌', color: 'bg-gray-100' }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`flex items-center gap-3 p-4 rounded-xl ${meta.color}`}>
        <span className="text-3xl">{catalogEntry?.emoji || meta.emoji}</span>
        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-white text-lg">{integration?.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{catalogEntry?.description || integration?.api_endpoint}</p>
        </div>
        {catalogEntry?.help && (
          <button type="button" onClick={() => setHelpOpen(h => !h)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${helpOpen ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-white/70 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'}`}>
            <HelpCircle size={14} /> {helpOpen ? 'Hide Guide' : 'Setup Guide'}
          </button>
        )}
      </div>

      {/* Detailed Help / Setup Guide (collapsible) */}
      {helpOpen && catalogEntry?.help && (
        <div className="border border-green-200 dark:border-green-800 rounded-xl p-4 bg-green-50 dark:bg-green-900/10">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
            <BookOpen size={14} /> Step-by-Step Configuration Guide
          </p>
          <ol className="space-y-2">
            {catalogEntry.help.map((step, i) => (
              <li key={i} className="flex gap-3 text-xs text-green-900 dark:text-green-200">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Quick setup reference */}
      {catalogEntry?.setup && !helpOpen && (
        <div className="flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-300 text-xs">
          <BookOpen size={14} className="shrink-0 mt-0.5" />
          <div><span className="font-semibold">Quick path: </span>{catalogEntry.setup}</div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Sync frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Authentication Type</label>
            <div className="input bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-default">
              {authTypeLabels[form.auth_type] || form.auth_type}
            </div>
          </div>
          <div>
            <label className="label">Sync Frequency</label>
            <select className="input" value={form.sync_frequency} onChange={e => set('sync_frequency', e.target.value)}>
              {syncOptions.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Credential fields */}
        <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Key size={12} /> Credentials
          </p>
          {fields.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</label>
              {f.type === 'aws_region' ? (
                <div className="space-y-2">
                  <select className="input" value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required}>
                    <option value="">-- Select Region --</option>
                    {AWS_REGIONS.map(r => (
                      <option key={r.value} value={r.value}>
                        {r.value === 'all' ? `${r.label} (scan every region)` : `${r.value} — ${r.label}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <MapPin size={10} /> Select "All Regions" to scan resources across every AWS region, or pick a specific region.
                  </p>
                </div>
              ) : f.type === 'textarea' ? (
                <textarea className="input font-mono text-xs" rows={4} placeholder={f.placeholder}
                  value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required} />
              ) : (
                <input className="input" type={f.type || 'text'} placeholder={f.placeholder}
                  value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required} />
              )}
            </div>
          ))}
        </div>

        {/* Advanced */}
        <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <Settings size={12} /> Advanced Settings
          </p>
          <div>
            <label className="label">API Endpoint URL</label>
            <input className="input font-mono text-sm" value={form.api_endpoint}
              onChange={e => set('api_endpoint', e.target.value)} placeholder="https://api.example.com/v1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Region / Instance</label>
              <input className="input" value={form.region} onChange={e => set('region', e.target.value)} placeholder="e.g. us-east-1" />
            </div>
            <div>
              <label className="label">Webhook URL</label>
              <input className="input" value={form.webhook_url} onChange={e => set('webhook_url', e.target.value)} placeholder="https://your-server/webhook" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Zap size={16} />
            {saving ? 'Saving...' : isConnect ? 'Connect Integration' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── App Catalog Modal ─────────────────────────────────────────────────────────
function AppCatalogModal({ existingIntegrations, onAdd, onClose }) {
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [adding, setAdding]         = useState(null)   // catalog key being added
  const [helpExpanded, setHelpExpanded] = useState(null) // catalog key with help open

  const existingNames = new Set(existingIntegrations.map(i => i.name.toLowerCase()))

  const allTypes = ['all', ...new Set(APP_CATALOG.map(a => a.type))]

  const filtered = APP_CATALOG.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.provider.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || a.type === typeFilter
    return matchSearch && matchType
  })

  const handleAdd = async (app) => {
    setAdding(app.key)
    try {
      const res = await api.post('/integrations', {
        name: app.name, provider: app.provider, type: app.type,
        api_endpoint: app.api_endpoint, auth_type: app.auth_type,
      })
      onAdd(res.data)
      onClose()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add application')
    } finally { setAdding(null) }
  }

  return (
    <div className="space-y-4">
      {/* Search + type filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input className="input pl-9" placeholder="Search applications..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {allTypes.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${typeFilter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* App grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
        {filtered.map(app => {
          const isAdded = existingNames.has(app.name.toLowerCase())
          const isAdding = adding === app.key
          const isHelpOpen = helpExpanded === app.key
          return (
            <div key={app.key} className={`border rounded-xl p-4 transition-colors ${isAdded ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'} ${isHelpOpen ? 'col-span-1 sm:col-span-2' : ''}`}>
              <div className="flex gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 ${app.color}`}>
                  {app.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{app.name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {app.help && (
                        <button onClick={() => setHelpExpanded(isHelpOpen ? null : app.key)}
                          className={`p-1 rounded-md transition-colors ${isHelpOpen ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                          title="Setup guide">
                          <HelpCircle size={14} />
                        </button>
                      )}
                      {isAdded
                        ? <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Added</span>
                        : <button onClick={() => handleAdd(app)} disabled={isAdding}
                            className="btn-primary text-xs py-1 px-2.5">
                            {isAdding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                            {isAdding ? 'Adding...' : 'Add'}
                          </button>
                      }
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 capitalize mt-0.5">{app.type.replace(/_/g, ' ')} · {authTypeLabels[app.auth_type]}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{app.description}</p>
                </div>
              </div>
              {/* Inline help section */}
              {isHelpOpen && app.help && (
                <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center gap-1.5">
                    <BookOpen size={12} /> How to Configure {app.name}
                  </p>
                  <ol className="space-y-1.5">
                    {app.help.map((step, i) => (
                      <li key={i} className="flex gap-2 text-[11px] text-gray-600 dark:text-gray-400">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center justify-center font-bold text-[9px]">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                    <Info size={10} /> Quick path: {app.setup}
                  </p>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-10 text-gray-400">No applications match your search</div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button onClick={onClose} className="btn-secondary">Close</button>
      </div>
    </div>
  )
}

function IntegrationCard({ integration, canManage, onRefresh }) {
  const [syncing, setSyncing] = useState(false)
  const [configModal, setConfigModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [syncDetails, setSyncDetails] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isConnected = integration.status === 'connected'
  const meta = providerMeta[integration.provider] || { emoji: '🔌', color: 'bg-gray-100' }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await api.post(`/integrations/${integration.id}/sync`)
      if (res.data.sync_details) setSyncDetails(res.data.sync_details)
      onRefresh()
    } catch (err) {
      alert(err.response?.data?.error || 'Sync failed')
    }
    setSyncing(false)
  }

  const loadSyncDetails = async () => {
    if (syncDetails) { setDetailsOpen(d => !d); return }
    try {
      const res = await api.get(`/integrations/${integration.id}/sync-details`)
      setSyncDetails(res.data.sync_details)
      setDetailsOpen(true)
    } catch {}
  }

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${integration.name}?`)) return
    await api.put(`/integrations/${integration.id}/disconnect`)
    onRefresh()
  }

  const handleDelete = async () => {
    if (!confirm(`Remove ${integration.name}? This will delete all configuration.`)) return
    await api.delete(`/integrations/${integration.id}`)
    onRefresh()
  }

  return (
    <>
      <div className={`card p-5 flex flex-col gap-3 transition-all ${!isConnected ? 'opacity-75' : ''}`}>
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${meta.color}`}>
              {meta.emoji}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{integration.name}</p>
              <Badge variant={typeColors[integration.type] || 'default'}>{integration.type.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-600 dark:text-green-400 font-medium">Live</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-xs text-gray-400">Offline</span></>
            )}
          </div>
        </div>

        {/* Stats (connected only) */}
        {isConnected && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">License Seats</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{(integration.licenses_discovered || 0).toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">Users</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{(integration.users_synced || 0).toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">Last Sync</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{integration.last_sync ? new Date(integration.last_sync).toLocaleTimeString() : 'Never'}</p>
            </div>
          </div>
        )}

        {/* Sync details (expandable) — shows real data from Microsoft Graph etc */}
        {isConnected && (integration.licenses_discovered > 0 || integration.users_synced > 0) && (
          <button onClick={loadSyncDetails} className="flex items-center justify-between text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
            <span className="flex items-center gap-1"><Info size={12} /> Sync Details & License Breakdown</span>
            {detailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {detailsOpen && syncDetails && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2 text-xs">
            {syncDetails.org_name && (
              <div className="flex justify-between"><span className="text-gray-400">Organization</span><span className="font-semibold text-gray-700 dark:text-gray-300">{syncDetails.org_name}</span></div>
            )}
            {syncDetails.domains && syncDetails.domains.length > 0 && (
              <div className="flex justify-between"><span className="text-gray-400">Domains</span><span className="text-gray-700 dark:text-gray-300 text-right max-w-[200px] truncate">{syncDetails.domains.join(', ')}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-400">Total Users</span><span className="font-medium text-gray-700 dark:text-gray-300">{syncDetails.total_users}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Enabled / Licensed</span><span className="font-medium text-gray-700 dark:text-gray-300">{syncDetails.enabled_users} / {syncDetails.licensed_users}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">License Seats Used</span><span className="font-medium text-gray-700 dark:text-gray-300">{syncDetails.consumed_license_seats} / {syncDetails.total_license_seats}</span></div>

            {syncDetails.skus && syncDetails.skus.length > 0 && (
              <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
                <p className="text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">License SKUs</p>
                {syncDetails.skus.map((s, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[150px]">{s.name}</span>
                    <span className="text-gray-700 dark:text-gray-300 font-mono">{s.consumed} / {s.enabled}</span>
                  </div>
                ))}
              </div>
            )}

            {syncDetails.top_departments && syncDetails.top_departments.length > 0 && (
              <div className="pt-1 border-t border-gray-200 dark:border-gray-700">
                <p className="text-gray-400 mb-1.5 font-semibold uppercase tracking-wider">Top Departments</p>
                {syncDetails.top_departments.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span className="text-gray-600 dark:text-gray-400">{d.name}</span>
                    <span className="text-gray-700 dark:text-gray-300 font-mono">{d.count} users</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connection details (expandable) */}
        {isConnected && integration.client_id && (
          <button onClick={() => setExpanded(e => !e)} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <span className="flex items-center gap-1"><Key size={12} /> Connection credentials</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {expanded && isConnected && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">Auth Type</span><span className="font-medium text-gray-700 dark:text-gray-300 uppercase">{integration.auth_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Client ID</span><span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{integration.client_id}</span></div>
            {integration.tenant_id && <div className="flex justify-between"><span className="text-gray-400">Tenant / Domain</span><span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{integration.tenant_id}</span></div>}
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex gap-2 mt-auto pt-1">
            {isConnected ? (
              <>
                <button onClick={handleSync} disabled={syncing} className="btn-secondary text-xs py-1.5 flex-1">
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
                <button onClick={() => setConfigModal(true)} className="btn-secondary text-xs py-1.5 px-3" title="Configure">
                  <Settings size={14} />
                </button>
                <button onClick={handleDisconnect} className="btn-secondary text-xs py-1.5 px-3 text-red-500 hover:text-red-600" title="Disconnect">
                  <XCircle size={14} />
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setConfigModal(true)} className="btn-primary text-xs py-1.5 flex-1 justify-center">
                  <Zap size={14} /> Connect & Configure
                </button>
                <button onClick={handleDelete} className="btn-secondary text-xs py-1.5 px-3 text-red-500 hover:text-red-600" title="Remove">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={configModal} onClose={() => setConfigModal(false)} title={isConnected ? `Configure — ${integration.name}` : `Connect — ${integration.name}`} size="lg">
        <ConfigModal
          integration={integration}
          mode={isConnected ? 'configure' : 'connect'}
          onClose={() => setConfigModal(false)}
          onSaved={onRefresh}
        />
      </Modal>
    </>
  )
}

export default function CloudIntegrations() {
  const [integrations, setIntegrations]   = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('all')
  const [catalogOpen, setCatalogOpen]     = useState(false)
  const [configTarget, setConfigTarget]   = useState(null)  // integration to configure after add
  const { hasRole } = useAuth()
  const canManage = hasRole('super_admin', 'it_admin', 'it_manager')

  const load = () => {
    setLoading(true)
    api.get('/integrations').then(r => setIntegrations(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Called when user adds a new app from catalog — auto-open config modal
  const handleAppAdded = (newIntegration) => {
    load()
    setConfigTarget(newIntegration)
  }

  const connected    = integrations.filter(i => i.status === 'connected')
  const disconnected = integrations.filter(i => i.status !== 'connected')

  const types = ['all', ...new Set(integrations.map(i => i.type))]
  const filtered = integrations.filter(i => filter === 'all' || i.type === filter)

  const connectedFiltered    = filtered.filter(i => i.status === 'connected')
  const disconnectedFiltered = filtered.filter(i => i.status !== 'connected')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cloud Integrations</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Connect SaaS & cloud applications to discover licenses and sync users</p>
        </div>
        {canManage && (
          <button onClick={() => setCatalogOpen(true)} className="btn-primary text-sm">
            <Plus size={16} /> Add Application
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Connected',          value: connected.length, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Configured / Idle',  value: disconnected.length, icon: XCircle, color: 'text-gray-400' },
          { label: 'Licenses Discovered',value: integrations.reduce((a, b) => a + (b.licenses_discovered || 0), 0).toLocaleString(), icon: Key, color: 'text-blue-600' },
          { label: 'Users Synced',       value: integrations.reduce((a, b) => a + (b.users_synced || 0), 0).toLocaleString(), icon: Users, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
              <s.icon size={22} className={`${s.color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Type filter tabs */}
      {integrations.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {/* Connected */}
          {connectedFiltered.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" /> Connected ({connectedFiltered.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {connectedFiltered.map(i => <IntegrationCard key={i.id} integration={i} canManage={canManage} onRefresh={load} />)}
              </div>
            </div>
          )}

          {/* Not yet connected */}
          {disconnectedFiltered.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <XCircle size={16} className="text-gray-400" /> Not Connected ({disconnectedFiltered.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {disconnectedFiltered.map(i => <IntegrationCard key={i.id} integration={i} canManage={canManage} onRefresh={load} />)}
              </div>
            </div>
          )}

          {integrations.length === 0 && (
            <div className="card p-16 text-center">
              <Globe size={48} className="text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-semibold text-lg">No applications added yet</p>
              <p className="text-sm text-gray-400 mt-1 mb-6">Connect your first cloud app to start discovering licenses and syncing users.</p>
              {canManage && (
                <button onClick={() => setCatalogOpen(true)} className="btn-primary mx-auto">
                  <Plus size={16} /> Browse Application Catalog
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* App Catalog Modal */}
      <Modal isOpen={catalogOpen} onClose={() => setCatalogOpen(false)} title="Add Application" size="xl">
        <AppCatalogModal
          existingIntegrations={integrations}
          onAdd={handleAppAdded}
          onClose={() => setCatalogOpen(false)}
        />
      </Modal>

      {/* Auto-opened config modal after adding from catalog */}
      {configTarget && (
        <Modal isOpen={true} onClose={() => setConfigTarget(null)} title={`Configure — ${configTarget.name}`} size="lg">
          <ConfigModal
            integration={configTarget}
            mode="connect"
            onClose={() => setConfigTarget(null)}
            onSaved={load}
          />
        </Modal>
      )}
    </div>
  )
}
