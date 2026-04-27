const express = require('express');
const https = require('https');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── Helpers ──────────────────────────────────────────────────────────────────

// Estimated on-demand monthly cost per EC2 instance type (USD, us-east-1, 730 hrs/mo)
const EC2_MONTHLY_COST = {
  't2.nano': 4.18, 't2.micro': 8.35, 't2.small': 16.79, 't2.medium': 33.58, 't2.large': 67.16, 't2.xlarge': 134.32, 't2.2xlarge': 268.64,
  't3.nano': 3.80, 't3.micro': 7.59, 't3.small': 15.18, 't3.medium': 30.37, 't3.large': 60.74, 't3.xlarge': 121.47, 't3.2xlarge': 242.94,
  't3a.nano': 3.43, 't3a.micro': 6.86, 't3a.small': 13.72, 't3a.medium': 27.45, 't3a.large': 54.90, 't3a.xlarge': 109.79, 't3a.2xlarge': 219.58,
  'm5.large': 70.08, 'm5.xlarge': 140.16, 'm5.2xlarge': 280.32, 'm5.4xlarge': 560.64,
  'm5a.large': 63.07, 'm5a.xlarge': 126.14, 'm5a.2xlarge': 252.29,
  'm6i.large': 70.08, 'm6i.xlarge': 140.16, 'm6i.2xlarge': 280.32, 'm6i.4xlarge': 560.64,
  'm6a.large': 63.07, 'm6a.xlarge': 126.14, 'm6a.2xlarge': 252.29,
  'm7i.large': 73.58, 'm7i.xlarge': 147.17, 'm7i.2xlarge': 294.34,
  'c5.large': 62.05, 'c5.xlarge': 124.10, 'c5.2xlarge': 248.20, 'c5.4xlarge': 496.40,
  'c5a.large': 55.84, 'c5a.xlarge': 111.69,
  'c6i.large': 62.05, 'c6i.xlarge': 124.10, 'c6i.2xlarge': 248.20,
  'c6a.large': 55.84, 'c6a.xlarge': 111.69,
  'c7i.large': 65.12, 'c7i.xlarge': 130.24,
  'r5.large': 91.98, 'r5.xlarge': 183.96, 'r5.2xlarge': 367.92,
  'r5a.large': 82.78, 'r5a.xlarge': 165.57,
  'r6i.large': 91.98, 'r6i.xlarge': 183.96,
  'r6a.large': 82.78, 'r6a.xlarge': 165.57,
  'a1.medium': 18.62, 'a1.large': 37.23, 'a1.xlarge': 74.46,
  'g4dn.xlarge': 383.25, 'g4dn.2xlarge': 546.25, 'g5.xlarge': 779.34,
  'p3.2xlarge': 2233.66,
  'i3.large': 114.10, 'i3.xlarge': 228.20,
  'd2.xlarge': 506.33,
};
const S3_MONTHLY_ESTIMATE = 2.30; // ~100GB at $0.023/GB

function getAllConnectedIntegrations() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM cloud_integrations WHERE status='connected'").all();
  return rows.map(r => {
    try { r.config = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {}); } catch { r.config = {}; }
    return r;
  });
}

function getIntegrationSyncDetails(integration) {
  return integration.config?.sync_details || {};
}

// ── Microsoft Graph helpers ──────────────────────────────────────────────────

function httpsPost(url, formBody) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(formBody).toString();
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error(d)) } }); });
    req.on('error', reject); req.end(data);
  });
}

function graphGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { reject(new Error(d)) } }); });
    req.on('error', reject); req.end();
  });
}

async function graphGetAll(url, token) {
  const all = [];
  let next = url;
  while (next) {
    const res = await graphGet(next, token);
    if (res.value) all.push(...res.value);
    next = res['@odata.nextLink'] || null;
  }
  return all;
}

async function getM365Token(integration) {
  const config = integration.config || {};
  const res = await httpsPost(`https://login.microsoftonline.com/${integration.tenant_id}/oauth2/v2.0/token`, {
    client_id: integration.client_id, client_secret: config.client_secret,
    scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
  });
  if (!res.access_token) throw new Error(res.error_description || 'Token failed');
  return res.access_token;
}

// SKU friendly names and per-user/month retail pricing (USD)
const SKU_NAMES = {
  SPB: 'Microsoft 365 Business Premium', O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  FLOW_FREE: 'Power Automate Free', POWER_BI_STANDARD: 'Power BI Free',
  POWERAPPS_DEV: 'Power Apps Developer', AAD_PREMIUM_P2: 'Entra ID P2',
  INTUNE_A_D: 'Intune Device', RMSBASIC: 'Azure RMS Basic',
  'Teams_Premium_(for_Departments)': 'Teams Premium', 'Power_Pages_vTrial_for_Makers': 'Power Pages Trial',
  ENTERPRISEPACK: 'Office 365 E3', ENTERPRISEPREMIUM: 'Office 365 E5',
  'Microsoft_365_E3': 'Microsoft 365 E3', 'Microsoft_365_E5': 'Microsoft 365 E5',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  EXCHANGESTANDARD: 'Exchange Online Plan 1', EXCHANGEENTERPRISE: 'Exchange Online Plan 2',
  VISIOCLIENT: 'Visio Plan 2', PROJECTPREMIUM: 'Project Plan 5',
  EMS_E5: 'Enterprise Mobility + Security E5', EMS_E3: 'Enterprise Mobility + Security E3',
};

const SKU_PRICES = {
  SPB: 22.00, O365_BUSINESS_PREMIUM: 12.50, FLOW_FREE: 0, POWER_BI_STANDARD: 0,
  POWERAPPS_DEV: 0, AAD_PREMIUM_P2: 9.00, INTUNE_A_D: 2.00, RMSBASIC: 0,
  'Teams_Premium_(for_Departments)': 10.00, 'Power_Pages_vTrial_for_Makers': 0,
  ENTERPRISEPACK: 23.00, ENTERPRISEPREMIUM: 38.00,
  'Microsoft_365_E3': 36.00, 'Microsoft_365_E5': 57.00,
  O365_BUSINESS_ESSENTIALS: 6.00, EXCHANGESTANDARD: 4.00, EXCHANGEENTERPRISE: 8.00,
  VISIOCLIENT: 15.00, PROJECTPREMIUM: 55.00,
  EMS_E5: 16.00, EMS_E3: 10.90,
};

// ── AI Application Catalog ───────────────────────────────────────────────────
const AI_APP_CATALOG = [
  { name: 'Claude (Anthropic)', vendor: 'Anthropic', category: 'AI Assistant', description: 'Advanced AI assistant for analysis, coding, writing, and reasoning', url: 'https://claude.ai', tiers: [
    { plan: 'Free', price: 0, features: 'Basic access, limited usage' },
    { plan: 'Pro', price: 20, features: 'Extended usage, priority access, Claude Opus/Sonnet' },
    { plan: 'Team', price: 30, features: 'Team workspace, admin controls, higher limits' },
    { plan: 'Enterprise', price: null, features: 'SSO, SCIM, custom data retention, dedicated support' },
    { plan: 'API', price: null, features: 'Pay-per-token: Opus $15/$75, Sonnet $3/$15, Haiku $0.25/$1.25 per 1M tokens (input/output)' },
  ]},
  { name: 'ChatGPT (OpenAI)', vendor: 'OpenAI', category: 'AI Assistant', description: 'Conversational AI for writing, coding, analysis, and image generation', url: 'https://chat.openai.com', tiers: [
    { plan: 'Free', price: 0, features: 'GPT-4o mini, limited usage' },
    { plan: 'Plus', price: 20, features: 'GPT-4o, DALL-E, advanced analysis' },
    { plan: 'Team', price: 30, features: 'Workspace, admin console, higher limits' },
    { plan: 'Enterprise', price: null, features: 'SSO, SCIM, unlimited GPT-4, data privacy' },
    { plan: 'API', price: null, features: 'Pay-per-token: GPT-4o $2.50/$10, GPT-4o-mini $0.15/$0.60 per 1M tokens' },
  ]},
  { name: 'GitHub Copilot', vendor: 'GitHub / Microsoft', category: 'AI Code Assistant', description: 'AI-powered code completion and suggestions in IDEs', url: 'https://github.com/features/copilot', tiers: [
    { plan: 'Individual', price: 10, features: 'Code completion, chat, CLI' },
    { plan: 'Business', price: 19, features: 'Organization management, policy controls, audit logs' },
    { plan: 'Enterprise', price: 39, features: 'Fine-tuned models, knowledge bases, SSO' },
  ]},
  { name: 'Google Gemini', vendor: 'Google', category: 'AI Assistant', description: 'Multimodal AI for text, code, images, and Google Workspace integration', url: 'https://gemini.google.com', tiers: [
    { plan: 'Free', price: 0, features: 'Basic Gemini access' },
    { plan: 'Advanced', price: 20, features: 'Gemini Ultra, 2TB storage, Workspace integration' },
    { plan: 'Business', price: 20, features: 'Google Workspace AI add-on per user' },
    { plan: 'API', price: null, features: 'Pay-per-token: Gemini Pro $1.25/$5, Flash $0.075/$0.30 per 1M tokens' },
  ]},
  { name: 'Microsoft Copilot', vendor: 'Microsoft', category: 'AI Productivity', description: 'AI assistant embedded in Microsoft 365, Windows, and Edge', url: 'https://copilot.microsoft.com', tiers: [
    { plan: 'Free', price: 0, features: 'Basic chat, web search, limited features' },
    { plan: 'Pro', price: 20, features: 'Priority GPT-4 Turbo, Microsoft 365 integration' },
    { plan: 'M365 Copilot', price: 30, features: 'Full integration with Word, Excel, PowerPoint, Teams, Outlook' },
  ]},
  { name: 'Midjourney', vendor: 'Midjourney', category: 'AI Image Generation', description: 'AI-powered image generation from text prompts', url: 'https://midjourney.com', tiers: [
    { plan: 'Basic', price: 10, features: '~200 images/month, 3 concurrent jobs' },
    { plan: 'Standard', price: 30, features: '15h fast time, unlimited relax' },
    { plan: 'Pro', price: 60, features: '30h fast time, stealth mode' },
    { plan: 'Mega', price: 120, features: '60h fast time, 12 concurrent jobs' },
  ]},
  { name: 'Cursor', vendor: 'Anysphere', category: 'AI Code Editor', description: 'AI-first code editor with Claude & GPT integration for coding', url: 'https://cursor.com', tiers: [
    { plan: 'Hobby', price: 0, features: '2000 completions, 50 slow requests/mo' },
    { plan: 'Pro', price: 20, features: 'Unlimited completions, 500 fast requests/mo' },
    { plan: 'Business', price: 40, features: 'Team management, centralized billing, SSO' },
  ]},
  { name: 'Notion AI', vendor: 'Notion', category: 'AI Productivity', description: 'AI writing and knowledge assistant built into Notion workspace', url: 'https://notion.so', tiers: [
    { plan: 'Add-on', price: 10, features: 'AI features per member per month on any Notion plan' },
  ]},
  { name: 'Perplexity AI', vendor: 'Perplexity', category: 'AI Search', description: 'AI-powered search engine with cited sources and real-time data', url: 'https://perplexity.ai', tiers: [
    { plan: 'Free', price: 0, features: 'Basic search, limited Pro queries' },
    { plan: 'Pro', price: 20, features: 'Unlimited Pro searches, file upload, API access' },
    { plan: 'Enterprise', price: null, features: 'SSO, data privacy, admin controls' },
  ]},
  { name: 'Grammarly', vendor: 'Grammarly', category: 'AI Writing', description: 'AI writing assistant for grammar, tone, and content improvement', url: 'https://grammarly.com', tiers: [
    { plan: 'Free', price: 0, features: 'Basic grammar and spelling' },
    { plan: 'Premium', price: 12, features: 'Advanced suggestions, tone, plagiarism' },
    { plan: 'Business', price: 15, features: 'Team analytics, style guides, SSO' },
  ]},
];

router.get('/ai-catalog', authenticate, (req, res) => {
  res.json({ data: AI_APP_CATALOG, total: AI_APP_CATALOG.length });
});

// ── SaaS Discovery — from ALL connected integrations ─────────────────────────

router.get('/discovered-apps', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    const data = [];
    let id = 0;

    // Include AI apps from catalog in discovered apps
    for (const aiApp of AI_APP_CATALOG) {
      id++;
      const cheapestPaid = aiApp.tiers.find(t => t.price && t.price > 0);
      data.push({
        id,
        name: aiApp.name,
        sku: aiApp.vendor,
        category: aiApp.category,
        source: 'AI Catalog',
        url: aiApp.url,
        detected_users: 0,
        total_seats: 0,
        price_per_user: cheapestPaid ? cheapestPaid.price : 0,
        monthly_cost: 0,
        total_cost: 0,
        is_sanctioned: 1,
        is_ai_app: true,
      });
    }

    for (const integ of integrations) {
      const sd = getIntegrationSyncDetails(integ);

      if (integ.name === 'Microsoft 365' || integ.name === 'Microsoft Intune') {
        // Live M365 SKU data
        try {
          const token = await getM365Token(integ);
          const skus = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
          for (const s of (skus.value || [])) {
            id++;
            const pricePerUser = SKU_PRICES[s.skuPartNumber] ?? null;
            const consumed = s.consumedUnits || 0;
            data.push({
              id,
              name: SKU_NAMES[s.skuPartNumber] || s.skuPartNumber.replace(/_/g, ' '),
              sku: s.skuPartNumber,
              category: 'SaaS',
              source: 'Microsoft 365',
              url: 'https://admin.microsoft.com',
              detected_users: consumed,
              total_seats: s.prepaidUnits ? s.prepaidUnits.enabled : 0,
              price_per_user: pricePerUser,
              monthly_cost: pricePerUser !== null ? pricePerUser * consumed : null,
              total_cost: pricePerUser !== null ? pricePerUser * (s.prepaidUnits ? s.prepaidUnits.enabled : 0) : null,
              is_sanctioned: 1,
            });
          }
        } catch (e) {
          console.error(`M365 discovered-apps error: ${e.message}`);
        }
      } else if (integ.name === 'AWS IAM') {
        // EC2 instances as discovered services
        const ec2Instances = sd.ec2_instances || [];
        if (ec2Instances.length > 0) {
          id++;
          const runningCount = ec2Instances.filter(i => i.state === 'running').length;
          const ec2Cost = ec2Instances.reduce((sum, i) => {
            if (i.state === 'running') return sum + (EC2_MONTHLY_COST[i.type] || EC2_MONTHLY_COST[i.instance_type] || 50);
            return sum;
          }, 0);
          data.push({
            id,
            name: 'Amazon EC2',
            sku: `${ec2Instances.length} instances (${runningCount} running)`,
            category: 'IaaS',
            source: 'AWS',
            url: 'https://console.aws.amazon.com/ec2',
            detected_users: runningCount,
            total_seats: ec2Instances.length,
            price_per_user: ec2Instances.length > 0 ? Math.round(ec2Cost / Math.max(runningCount, 1)) : 0,
            monthly_cost: ec2Cost,
            total_cost: ec2Cost,
            is_sanctioned: 1,
          });
        }
        // S3 buckets as discovered service
        const s3Buckets = sd.s3_buckets || [];
        if (s3Buckets.length > 0) {
          id++;
          const s3Cost = s3Buckets.length * S3_MONTHLY_ESTIMATE;
          data.push({
            id,
            name: 'Amazon S3',
            sku: `${s3Buckets.length} buckets`,
            category: 'Storage',
            source: 'AWS',
            url: 'https://console.aws.amazon.com/s3',
            detected_users: s3Buckets.length,
            total_seats: s3Buckets.length,
            price_per_user: S3_MONTHLY_ESTIMATE,
            monthly_cost: s3Cost,
            total_cost: s3Cost,
            is_sanctioned: 1,
          });
        }
        // IAM Users as discovered service
        const iamUsers = sd.iam_users || [];
        if (iamUsers.length > 0) {
          id++;
          data.push({
            id,
            name: 'AWS IAM Users',
            sku: `${iamUsers.length} users`,
            category: 'Identity',
            source: 'AWS',
            url: 'https://console.aws.amazon.com/iam',
            detected_users: iamUsers.length,
            total_seats: iamUsers.length,
            price_per_user: 0,
            monthly_cost: 0,
            total_cost: 0,
            is_sanctioned: 1,
          });
        }
        // IAM Roles as discovered service
        const iamRoles = sd.iam_roles || [];
        if (iamRoles.length > 0) {
          id++;
          data.push({
            id,
            name: 'AWS IAM Roles',
            sku: `${iamRoles.length} roles`,
            category: 'Identity',
            source: 'AWS',
            url: 'https://console.aws.amazon.com/iam',
            detected_users: iamRoles.length,
            total_seats: iamRoles.length,
            price_per_user: 0,
            monthly_cost: 0,
            total_cost: 0,
            is_sanctioned: 1,
          });
        }
        // IAM Policies
        const iamPolicies = sd.iam_policies || [];
        if (iamPolicies.length > 0) {
          id++;
          data.push({
            id,
            name: 'AWS IAM Policies',
            sku: `${iamPolicies.length} policies`,
            category: 'IAM Policy',
            source: 'AWS',
            url: 'https://console.aws.amazon.com/iam',
            detected_users: iamPolicies.reduce((s, p) => s + (p.attachments || 0), 0),
            total_seats: iamPolicies.length,
            price_per_user: 0,
            monthly_cost: 0,
            total_cost: 0,
            is_sanctioned: 1,
          });
        }
      } else {
        // Generic: show sync summary if available
        if (sd && (integ.users_synced > 0 || integ.licenses_discovered > 0)) {
          id++;
          data.push({
            id,
            name: integ.name,
            sku: integ.provider || integ.type,
            category: integ.type || 'SaaS',
            source: integ.name,
            url: integ.api_endpoint || '#',
            detected_users: integ.users_synced || 0,
            total_seats: integ.licenses_discovered || 0,
            price_per_user: null,
            monthly_cost: null,
            total_cost: null,
            is_sanctioned: 1,
          });
        }
      }
    }

    res.json({ data, total: data.length });
  } catch (err) {
    console.error('discovered-apps error:', err.message);
    res.json({ data: [], total: 0 });
  }
});

router.put('/discovered-apps/:id/sanction', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'App status updated' });
});

// ── License Reclamation — from M365 (other integrations don't have user sign-in data) ─

router.get('/reclamation', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    const m365 = integrations.find(i => i.name === 'Microsoft 365' || i.name === 'Microsoft Intune');
    if (!m365) return res.json({ data: [], summary: { pending: 0, in_review: 0, completed: 0, potential_savings: 0, realized_savings: 0 } });

    const token = await getM365Token(m365);

    let users;
    try {
      users = await graphGetAll(
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department,signInActivity',
        token
      );
    } catch {
      users = await graphGetAll(
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department',
        token
      );
    }

    const now = Date.now();
    const items = [];
    let id = 0;

    for (const u of users) {
      if (!u.assignedLicenses || u.assignedLicenses.length === 0) continue;
      if (!u.accountEnabled) {
        id++;
        items.push({
          id, software_name: 'Microsoft 365 (' + u.assignedLicenses.length + ' licenses)',
          user_name: u.displayName, user_email: u.mail || u.userPrincipalName,
          last_used: null, days_inactive: 999, license_cost: u.assignedLicenses.length * 15.00,
          status: 'pending', action_taken: null, savings: 0,
        });
        continue;
      }
      const lastSignIn = u.signInActivity?.lastSignInDateTime;
      if (lastSignIn) {
        const daysSince = Math.floor((now - new Date(lastSignIn).getTime()) / 86400000);
        if (daysSince > 30) {
          id++;
          items.push({
            id, software_name: 'Microsoft 365 (' + u.assignedLicenses.length + ' licenses)',
            user_name: u.displayName, user_email: u.mail || u.userPrincipalName,
            last_used: lastSignIn.split('T')[0], days_inactive: daysSince,
            license_cost: u.assignedLicenses.length * 15.00,
            status: daysSince > 90 ? 'pending' : 'in_review', action_taken: null, savings: 0,
          });
        }
      }
    }

    items.sort((a, b) => b.days_inactive - a.days_inactive);
    const summary = {
      pending: items.filter(i => i.status === 'pending').length,
      in_review: items.filter(i => i.status === 'in_review').length,
      completed: 0,
      potential_savings: items.filter(i => i.status === 'pending').reduce((s, i) => s + i.license_cost, 0),
      realized_savings: 0,
    };
    res.json({ data: items, summary });
  } catch (err) {
    console.error('reclamation error:', err.message);
    res.json({ data: [], summary: { pending: 0, in_review: 0, completed: 0, potential_savings: 0, realized_savings: 0 } });
  }
});

router.put('/reclamation/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Reclamation record updated' });
});

router.post('/reclamation/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Scan triggered — data is now pulled live from connected integrations.', found: 0 });
});

// ── Cloud Infrastructure — from ALL connected integrations ───────────────────

router.get('/cloud-resources', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    const providerFilter = req.query.provider;
    const resources = [];
    const summaryMap = {};
    let id = 0;

    for (const integ of integrations) {
      const sd = getIntegrationSyncDetails(integ);
      const provider = integ.provider || integ.name;

      if (providerFilter && provider !== providerFilter) continue;

      if (integ.name === 'Microsoft 365' || integ.name === 'Microsoft Intune') {
        // Fetch live SKU data from Microsoft Graph
        let skus = [];
        try {
          const token = await getM365Token(integ);
          const skuResp = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
          skus = (skuResp.value || []).map(s => ({
            name: s.skuPartNumber,
            consumed: s.consumedUnits || 0,
            enabled: s.prepaidUnits ? s.prepaidUnits.enabled : 0,
          }));
        } catch (e) {
          console.error('M365 cloud-resources live fetch failed, falling back to sync_details:', e.message);
          skus = sd.skus || [];
        }
        for (const s of skus) {
          id++;
          const price = SKU_PRICES[s.name] ?? 0;
          resources.push({
            id,
            resource_name: SKU_NAMES[s.name] || s.name.replace(/_/g, ' '),
            provider: 'Microsoft',
            resource_type: 'SaaS License',
            region: 'Global',
            status: (s.consumed || 0) > 0 ? 'active' : 'inactive',
            monthly_cost: price * (s.consumed || 0),
            total_cost: price * (s.enabled || 0),
            price_per_user: price,
            consumed: s.consumed || 0,
            enabled: s.enabled || 0,
            software_installed: s.name,
            integration_name: integ.name,
            last_scanned: new Date().toISOString(),
          });
        }
      } else if (integ.name === 'AWS IAM') {
        // EC2 instances
        const instances = sd.ec2_instances || [];
        for (const inst of instances) {
          id++;
          const ec2Cost = inst.state === 'running' ? (EC2_MONTHLY_COST[inst.type] || 50) : 0;
          resources.push({
            id,
            resource_name: inst.name || inst.id,
            provider: 'Amazon',
            resource_type: 'EC2 Instance',
            region: inst.region || 'us-east-1',
            status: inst.state || 'unknown',
            monthly_cost: ec2Cost,
            total_cost: EC2_MONTHLY_COST[inst.type] || 50,
            price_per_user: EC2_MONTHLY_COST[inst.type] || 50,
            consumed: inst.state === 'running' ? 1 : 0,
            enabled: 1,
            software_installed: `${inst.type} / ${inst.platform || 'Linux'}`,
            integration_name: 'AWS IAM',
            last_scanned: integ.last_sync,
            details: {
              instance_id: inst.id,
              instance_type: inst.type,
              public_ip: inst.public_ip,
              private_ip: inst.private_ip,
              az: inst.az,
              launch_time: inst.launch_time,
            },
          });
        }
        // S3 buckets
        const buckets = sd.s3_buckets || [];
        for (const b of buckets) {
          id++;
          resources.push({
            id,
            resource_name: b.name,
            provider: 'Amazon',
            resource_type: 'S3 Bucket',
            region: 'Global',
            status: 'active',
            monthly_cost: S3_MONTHLY_ESTIMATE,
            total_cost: S3_MONTHLY_ESTIMATE,
            price_per_user: 0,
            consumed: 1,
            enabled: 1,
            software_installed: 'S3',
            integration_name: 'AWS IAM',
            last_scanned: integ.last_sync,
          });
        }
        // IAM users as resources
        const iamUsers = sd.iam_users || [];
        for (const u of iamUsers) {
          id++;
          resources.push({
            id,
            resource_name: u.name,
            provider: 'Amazon',
            resource_type: 'IAM User',
            region: 'Global',
            status: 'active',
            monthly_cost: 0,
            total_cost: 0,
            price_per_user: 0,
            consumed: 1,
            enabled: 1,
            software_installed: `Keys: ${u.access_keys || 0}, MFA: ${u.mfa_enabled ? 'Yes' : 'No'}`,
            integration_name: 'AWS IAM',
            last_scanned: integ.last_sync,
          });
        }
        // IAM roles
        const iamRoles = sd.iam_roles || [];
        for (const r of iamRoles) {
          id++;
          resources.push({
            id,
            resource_name: r.name,
            provider: 'Amazon',
            resource_type: 'IAM Role',
            region: 'Global',
            status: 'active',
            monthly_cost: 0,
            total_cost: 0,
            price_per_user: 0,
            consumed: 1,
            enabled: 1,
            software_installed: r.arn || '',
            integration_name: 'AWS IAM',
            last_scanned: integ.last_sync,
          });
        }
      } else {
        // Generic: show the integration itself as a resource if it has data
        if (integ.users_synced > 0 || integ.licenses_discovered > 0) {
          id++;
          resources.push({
            id,
            resource_name: integ.name,
            provider,
            resource_type: integ.type || 'Service',
            region: 'Global',
            status: 'active',
            monthly_cost: 0,
            total_cost: 0,
            price_per_user: 0,
            consumed: integ.users_synced || 0,
            enabled: integ.licenses_discovered || 0,
            software_installed: integ.name,
            integration_name: integ.name,
            last_scanned: integ.last_sync,
          });
        }
      }
    }

    // Build summary by provider
    for (const r of resources) {
      if (!summaryMap[r.provider]) summaryMap[r.provider] = { provider: r.provider, count: 0, monthly_cost: 0 };
      summaryMap[r.provider].count++;
      summaryMap[r.provider].monthly_cost += r.monthly_cost || 0;
    }

    res.json({ data: resources, summary: Object.values(summaryMap), total: resources.length });
  } catch (err) {
    console.error('cloud-resources error:', err.message);
    res.json({ data: [], summary: [], total: 0 });
  }
});

router.post('/cloud-resources/scan', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  res.json({ message: 'Infrastructure data is pulled live from connected integrations.' });
});

// ── Shadow IT — disabled users with active licenses ─────────────────────────

router.get('/shadow-it', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    const items = [];
    let id = 0;

    // M365 shadow IT detection
    const m365 = integrations.find(i => i.name === 'Microsoft 365' || i.name === 'Microsoft Intune');
    if (m365) {
      try {
        const token = await getM365Token(m365);
        const users = await graphGetAll(
          'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,mail,userPrincipalName,accountEnabled,assignedLicenses,department',
          token
        );

        for (const u of users) {
          if (!u.accountEnabled && u.assignedLicenses && u.assignedLicenses.length > 0) {
            id++;
            items.push({
              id, app_name: u.displayName + ' (Disabled Account)',
              category: 'Disabled User with Licenses', detected_via: 'Microsoft 365 Sync',
              users_count: u.assignedLicenses.length,
              risk_level: u.assignedLicenses.length >= 3 ? 'high' : u.assignedLicenses.length >= 2 ? 'medium' : 'low',
              monthly_cost_estimate: u.assignedLicenses.length * 12.50,
              status: 'detected',
              notes: `${u.mail || u.userPrincipalName} — account disabled but ${u.assignedLicenses.length} license(s) still assigned. Department: ${u.department || 'N/A'}`,
            });
          }
        }
        for (const u of users) {
          if (u.accountEnabled && u.userPrincipalName && u.userPrincipalName.includes('#EXT#')) {
            id++;
            items.push({
              id, app_name: u.displayName + ' (External Guest)',
              category: 'Guest Access', detected_via: 'Microsoft 365 Sync',
              users_count: 1, risk_level: 'low', monthly_cost_estimate: 0,
              status: 'detected', notes: `External guest: ${u.userPrincipalName}`,
            });
          }
        }
      } catch (e) {
        console.error(`M365 shadow-it error: ${e.message}`);
      }
    }

    // AWS shadow IT — IAM users without MFA = medium risk, users with multiple access keys = high risk
    const aws = integrations.find(i => i.name === 'AWS IAM');
    if (aws) {
      const sd = getIntegrationSyncDetails(aws);
      const iamUsers = sd.iam_users || [];
      for (const u of iamUsers) {
        if (!u.mfa_enabled) {
          id++;
          items.push({
            id, app_name: `${u.name} (No MFA)`,
            category: 'IAM Security Risk', detected_via: 'AWS IAM Sync',
            users_count: 1, risk_level: (u.access_keys || 0) > 1 ? 'high' : 'medium',
            monthly_cost_estimate: 0, status: 'detected',
            notes: `IAM user "${u.name}" has no MFA enabled. Access keys: ${u.access_keys || 0}. ARN: ${u.arn || ''}`,
          });
        }
        if ((u.access_keys || 0) > 1) {
          id++;
          items.push({
            id, app_name: `${u.name} (Multiple Access Keys)`,
            category: 'IAM Security Risk', detected_via: 'AWS IAM Sync',
            users_count: u.access_keys, risk_level: 'high',
            monthly_cost_estimate: 0, status: 'detected',
            notes: `IAM user "${u.name}" has ${u.access_keys} access keys — best practice is 1. ARN: ${u.arn || ''}`,
          });
        }
      }
    }

    // Merge persisted statuses from DB
    const db = getDb();
    const persisted = db.prepare('SELECT id, app_name, notes, status FROM shadow_it').all();
    const statusMap = {};
    for (const p of persisted) {
      statusMap[p.app_name + '|||' + (p.notes || '')] = { dbId: p.id, status: p.status };
    }
    for (const item of items) {
      const key = item.app_name + '|||' + (item.notes || '');
      if (statusMap[key]) {
        item.id = statusMap[key].dbId;
        item.status = statusMap[key].status;
      }
    }

    const summary = {
      total: items.length,
      high_risk: items.filter(a => a.risk_level === 'high').length,
      medium_risk: items.filter(a => a.risk_level === 'medium').length,
      low_risk: items.filter(a => a.risk_level === 'low').length,
      total_monthly_cost: items.reduce((s, a) => s + (a.monthly_cost_estimate || 0), 0),
    };
    res.json({ data: items, summary });
  } catch (err) {
    console.error('shadow-it error:', err.message);
    res.json({ data: [], summary: { total: 0, high_risk: 0, medium_risk: 0, low_risk: 0, total_monthly_cost: 0 } });
  }
});

router.put('/shadow-it/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });

  // The id may be a DB id (persisted item) or an ephemeral id.
  // Try DB first, fallback to upsert by matching app_name + notes from the request body.
  const existing = db.prepare('SELECT id FROM shadow_it WHERE id = ?').get(req.params.id);
  if (existing) {
    db.prepare('UPDATE shadow_it SET status = ?, last_seen = datetime("now") WHERE id = ?')
      .run(status, req.params.id);
    return res.json({ message: 'Shadow IT record updated', id: existing.id });
  }

  // If not found by numeric id, the frontend may send item details for upsert
  const { app_name, notes, category, detected_via, users_count, risk_level, monthly_cost_estimate } = req.body;
  if (app_name && notes) {
    const match = db.prepare('SELECT id FROM shadow_it WHERE app_name = ? AND notes = ?').get(app_name, notes);
    if (match) {
      db.prepare('UPDATE shadow_it SET status = ?, last_seen = datetime("now") WHERE id = ?')
        .run(status, match.id);
      return res.json({ message: 'Shadow IT record updated', id: match.id });
    }
    // Insert new
    const result = db.prepare(
      'INSERT INTO shadow_it (app_name, category, detected_via, users_count, risk_level, monthly_cost_estimate, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(app_name, category || '', detected_via || '', users_count || 0, risk_level || 'medium', monthly_cost_estimate || 0, status, notes);
    return res.json({ message: 'Shadow IT record created', id: result.lastInsertRowid });
  }

  res.status(404).json({ error: 'Shadow IT record not found' });
});

// ── Combined intelligence summary — from ALL connected integrations ──────────

router.get('/summary', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();

    let discoveredApps = 0;
    let totalUsers = 0;
    let enabledUsers = 0;
    let licensedUsers = 0;
    let totalLicenseSeats = 0;
    let consumedLicenseSeats = 0;
    let cloudMonthlyCost = 0;
    let totalCommittedCost = 0;
    let reclaimCandidates = 0;
    let cloudResources = 0;
    let orgName = null;
    const providers = [];

    for (const integ of integrations) {
      const sd = getIntegrationSyncDetails(integ);

      if (integ.name === 'Microsoft 365' || integ.name === 'Microsoft Intune') {
        // Fetch live SKU data for accurate cost
        let skus = sd.skus || [];
        try {
          const token = await getM365Token(integ);
          const skuResp = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
          skus = (skuResp.value || []).map(s => ({
            name: s.skuPartNumber,
            consumed: s.consumedUnits || 0,
            enabled: s.prepaidUnits ? s.prepaidUnits.enabled : 0,
          }));
        } catch (e) {
          console.error('M365 summary live fetch failed, using sync_details:', e.message);
        }
        discoveredApps += skus.length;
        totalUsers += sd.total_users || 0;
        enabledUsers += sd.enabled_users || 0;
        licensedUsers += sd.licensed_users || 0;
        totalLicenseSeats += skus.reduce((sum, s) => sum + (s.enabled || 0), 0) || sd.total_license_seats || 0;
        consumedLicenseSeats += skus.reduce((sum, s) => sum + (s.consumed || 0), 0) || sd.consumed_license_seats || 0;
        reclaimCandidates += (sd.total_users || 0) - (sd.enabled_users || 0);
        orgName = orgName || sd.org_name || null;
        cloudResources += skus.length;

        cloudMonthlyCost += skus.reduce((sum, s) => sum + ((SKU_PRICES[s.name] ?? 0) * (s.consumed || 0)), 0);
        totalCommittedCost += skus.reduce((sum, s) => sum + ((SKU_PRICES[s.name] ?? 0) * (s.enabled || 0)), 0);
        providers.push('Microsoft');
      } else if (integ.name === 'AWS IAM') {
        const ec2Instances = sd.ec2_instances || [];
        const s3Buckets = sd.s3_buckets || [];
        const ec2Count = ec2Instances.length || sd.total_ec2_instances || 0;
        const s3Count = s3Buckets.length || sd.total_s3_buckets || 0;
        const iamUserCount = (sd.iam_users || []).length || sd.total_iam_users || 0;
        const iamRoleCount = (sd.iam_roles || []).length || sd.total_iam_roles || 0;
        const iamPolicyCount = (sd.iam_policies || []).length || sd.total_iam_policies || 0;

        discoveredApps += iamPolicyCount;
        cloudResources += ec2Count + s3Count + iamUserCount + iamRoleCount;
        totalUsers += iamUserCount;
        enabledUsers += iamUserCount;

        // Calculate AWS monthly cost from EC2 running instances + S3 buckets
        let awsMonthlyCost = 0;
        for (const inst of ec2Instances) {
          if (inst.state === 'running') {
            awsMonthlyCost += EC2_MONTHLY_COST[inst.type] || EC2_MONTHLY_COST[inst.instance_type] || 50;
          }
        }
        awsMonthlyCost += s3Count * S3_MONTHLY_ESTIMATE;
        cloudMonthlyCost += awsMonthlyCost;
        totalCommittedCost += awsMonthlyCost;

        providers.push('Amazon');
      } else {
        // Generic integration
        discoveredApps += integ.licenses_discovered > 0 ? 1 : 0;
        cloudResources += integ.licenses_discovered > 0 ? 1 : 0;
        totalUsers += integ.users_synced || 0;
        if (integ.provider) providers.push(integ.provider);
      }
    }

    res.json({
      discovered_apps: discoveredApps,
      unsanctioned_apps: 0,
      reclaim_candidates: reclaimCandidates,
      potential_savings: reclaimCandidates * 15.00,
      shadow_it_high_risk: 0,
      cloud_resources: cloudResources,
      cloud_monthly_cost: cloudMonthlyCost,
      total_committed_cost: totalCommittedCost,
      total_users: totalUsers,
      enabled_users: enabledUsers,
      licensed_users: licensedUsers,
      total_license_seats: totalLicenseSeats,
      consumed_license_seats: consumedLicenseSeats,
      unused_license_seats: totalLicenseSeats - consumedLicenseSeats,
      org_name: orgName,
      providers: [...new Set(providers)],
      integrations_connected: integrations.length,
    });
  } catch (err) {
    console.error('summary error:', err.message);
    res.json({ discovered_apps: 0, unsanctioned_apps: 0, reclaim_candidates: 0, potential_savings: 0, shadow_it_high_risk: 0, cloud_resources: 0, cloud_monthly_cost: 0 });
  }
});

// ── Cost Analyzer — auto-computed from integration sync data ────────────────
router.get('/cost-analyzer', authenticate, async (req, res) => {
  try {
    const integrations = getAllConnectedIntegrations();
    const breakdown = [];      // per-service line items
    const byProvider = {};     // grouped totals
    let totalMonthly = 0;
    let totalCommitted = 0;
    let totalWasted = 0;

    for (const integ of integrations) {
      const sd = getIntegrationSyncDetails(integ);
      const providerName = integ.name || integ.provider || 'Unknown';

      if (providerName.includes('Microsoft') || providerName.includes('M365') || providerName.includes('365')) {
        // Live SKU fetch for most accurate numbers
        let skus = sd.skus || [];
        try {
          const token = await getM365Token(integ);
          const skuResp = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus', token);
          skus = (skuResp.value || []).map(s => ({
            name: s.skuPartNumber,
            displayName: s.skuPartNumber.replace(/_/g, ' '),
            consumed: s.consumedUnits || 0,
            enabled: s.prepaidUnits ? s.prepaidUnits.enabled : 0,
            suspended: s.prepaidUnits ? (s.prepaidUnits.suspended || 0) : 0,
            appliesTo: s.appliesTo || 'User',
          }));
        } catch { /* use cached sync_details */ }

        const prov = 'Microsoft 365';
        if (!byProvider[prov]) byProvider[prov] = { provider: prov, monthly: 0, committed: 0, wasted: 0, items: 0, users: sd.total_users || 0 };

        for (const sku of skus) {
          const price = SKU_PRICES[sku.name] ?? 0;
          const monthlyActive = price * (sku.consumed || 0);
          const monthlyCommitted = price * (sku.enabled || 0);
          const monthlyWasted = price * Math.max(0, (sku.enabled || 0) - (sku.consumed || 0));

          breakdown.push({
            provider: prov,
            service: SKU_NAMES[sku.name] || sku.name.replace(/_/g, ' '),
            sku: sku.name,
            type: 'SaaS License',
            units_active: sku.consumed || 0,
            units_committed: sku.enabled || 0,
            units_unused: Math.max(0, (sku.enabled || 0) - (sku.consumed || 0)),
            price_per_unit: price,
            monthly_active: Math.round(monthlyActive * 100) / 100,
            monthly_committed: Math.round(monthlyCommitted * 100) / 100,
            monthly_wasted: Math.round(monthlyWasted * 100) / 100,
            billing_cycle: 'monthly',
            currency: 'USD',
          });

          byProvider[prov].monthly += monthlyActive;
          byProvider[prov].committed += monthlyCommitted;
          byProvider[prov].wasted += monthlyWasted;
          byProvider[prov].items++;
          totalMonthly += monthlyActive;
          totalCommitted += monthlyCommitted;
          totalWasted += monthlyWasted;
        }
      } else if (providerName.includes('AWS') || providerName.includes('Amazon')) {
        const prov = 'Amazon Web Services';
        if (!byProvider[prov]) byProvider[prov] = { provider: prov, monthly: 0, committed: 0, wasted: 0, items: 0, users: 0 };

        const ec2Instances = sd.ec2_instances || [];
        for (const inst of ec2Instances) {
          const instType = inst.instance_type || inst.type || 'unknown';
          const cost = EC2_MONTHLY_COST[instType] || 50;
          const isRunning = inst.state === 'running';
          const monthlyCost = isRunning ? cost : 0;

          breakdown.push({
            provider: prov,
            service: `EC2: ${inst.name || inst.instance_id || 'Instance'}`,
            sku: instType,
            type: 'Compute',
            units_active: isRunning ? 1 : 0,
            units_committed: 1,
            units_unused: isRunning ? 0 : 1,
            price_per_unit: cost,
            monthly_active: monthlyCost,
            monthly_committed: cost,
            monthly_wasted: isRunning ? 0 : cost,
            billing_cycle: 'on-demand',
            currency: 'USD',
            status: inst.state,
            region: inst.region || inst.placement || '',
          });

          byProvider[prov].monthly += monthlyCost;
          byProvider[prov].committed += cost;
          byProvider[prov].wasted += isRunning ? 0 : cost;
          byProvider[prov].items++;
          totalMonthly += monthlyCost;
          totalCommitted += cost;
          totalWasted += isRunning ? 0 : cost;
        }

        const s3Buckets = sd.s3_buckets || [];
        if (s3Buckets.length > 0) {
          const s3Total = s3Buckets.length * S3_MONTHLY_ESTIMATE;
          breakdown.push({
            provider: prov,
            service: `S3 Storage (${s3Buckets.length} buckets)`,
            sku: 's3-standard',
            type: 'Storage',
            units_active: s3Buckets.length,
            units_committed: s3Buckets.length,
            units_unused: 0,
            price_per_unit: S3_MONTHLY_ESTIMATE,
            monthly_active: s3Total,
            monthly_committed: s3Total,
            monthly_wasted: 0,
            billing_cycle: 'usage-based',
            currency: 'USD',
          });
          byProvider[prov].monthly += s3Total;
          byProvider[prov].committed += s3Total;
          byProvider[prov].items++;
          totalMonthly += s3Total;
          totalCommitted += s3Total;
        }

        byProvider[prov].users = (sd.iam_users || []).length;
      }
    }

    // Round provider totals
    Object.values(byProvider).forEach(p => {
      p.monthly = Math.round(p.monthly * 100) / 100;
      p.committed = Math.round(p.committed * 100) / 100;
      p.wasted = Math.round(p.wasted * 100) / 100;
    });

    res.json({
      total_monthly: Math.round(totalMonthly * 100) / 100,
      total_committed: Math.round(totalCommitted * 100) / 100,
      total_wasted: Math.round(totalWasted * 100) / 100,
      total_annual: Math.round(totalMonthly * 12 * 100) / 100,
      optimization_pct: totalCommitted > 0 ? Math.round((1 - totalWasted / totalCommitted) * 100) : 100,
      by_provider: Object.values(byProvider),
      breakdown: breakdown.sort((a, b) => b.monthly_active - a.monthly_active),
    });
  } catch (err) {
    console.error('cost-analyzer error:', err.message);
    res.json({ total_monthly: 0, total_committed: 0, total_wasted: 0, total_annual: 0, optimization_pct: 100, by_provider: [], breakdown: [] });
  }
});

module.exports = router;
