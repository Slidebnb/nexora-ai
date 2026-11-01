/*
 * Katalog der verbindbaren Dienste (Konnektoren über das offene MCP-Format). Ausgelagert, damit sowohl die
 * Einstellungen als auch das Onboarding dieselbe schöne, große Sammlung zeigen können.
 *
 * Ehrlich: Es gibt kein universelles „Ein-Klick-Anmelden" ohne eigenen Server. Jede Karte ist eine Starthilfe, die
 * die Verbinden-Maske vorbelegt und erklärt, wo die MCP-Adresse des Dienstes herkommt. Es werden KEINE fremden
 * Markenlogos ausgeliefert – die Symbole sind neutrale, thematische Platzhalter (lucide-react).
 */
import {
  Boxes, Briefcase, Calendar, Cloud, Code2, CreditCard, FileSpreadsheet, FileText, FolderOpen, GitBranch,
  Hash, Headphones, LayoutGrid, LifeBuoy, ListTodo, Mail, Megaphone, MessageSquare, Receipt, Send, ShoppingCart,
  Target, Users, Video, type LucideIcon
} from 'lucide-react'

export type ConnectorCategory =
  | 'E-Mail & Kalender'
  | 'Dateien & Cloud'
  | 'Chat & Team'
  | 'Produktivität & Aufgaben'
  | 'Entwicklung'
  | 'Vertrieb & CRM'
  | 'Marketing & Social'
  | 'Finanzen & Commerce'
  | 'Wissen & Support'
  | 'Sonstiges'

export interface ConnectorTemplate {
  id: string
  name: string
  icon: LucideIcon
  category: ConnectorCategory
  desc: string
  urlPlaceholder: string
  hint: string
  needsToken: boolean
}

export const CONNECTOR_CATEGORY_ORDER: ConnectorCategory[] = [
  'E-Mail & Kalender',
  'Dateien & Cloud',
  'Chat & Team',
  'Produktivität & Aufgaben',
  'Entwicklung',
  'Vertrieb & CRM',
  'Marketing & Social',
  'Finanzen & Commerce',
  'Wissen & Support',
  'Sonstiges'
]

const MCP = 'https://…/mcp'
const tokenHint = (dienst: string) =>
  `Füge die MCP-Adresse eines ${dienst}-MCP-Dienstes ein (vom Anbieter oder deinem selbst betriebenen MCP-Server). Meist mit Zugangstoken.`

const svc = (id: string, name: string, icon: LucideIcon, category: ConnectorCategory, desc: string): ConnectorTemplate => ({
  id,
  name,
  icon,
  category,
  desc,
  urlPlaceholder: MCP,
  hint: tokenHint(name),
  needsToken: true
})

export const CONNECTOR_CATALOG: ConnectorTemplate[] = [
  // E-Mail & Kalender
  svc('gmail', 'Gmail', Mail, 'E-Mail & Kalender', 'Google-Mail'),
  svc('outlook', 'Outlook / Microsoft 365', Mail, 'E-Mail & Kalender', 'Microsoft-Mail'),
  svc('gcal', 'Google Kalender', Calendar, 'E-Mail & Kalender', 'Termine'),
  svc('outlook-cal', 'Outlook-Kalender', Calendar, 'E-Mail & Kalender', 'Microsoft-Termine'),
  svc('proton', 'Proton Mail', Mail, 'E-Mail & Kalender', 'Verschlüsselte Mail'),
  svc('gmx', 'GMX / WEB.DE', Mail, 'E-Mail & Kalender', 'Deutsche Mail-Dienste'),

  // Dateien & Cloud
  svc('gdrive', 'Google Drive', FolderOpen, 'Dateien & Cloud', 'Dateien in Google Drive'),
  svc('onedrive', 'OneDrive', Cloud, 'Dateien & Cloud', 'Dateien in OneDrive'),
  svc('dropbox', 'Dropbox', Cloud, 'Dateien & Cloud', 'Dateien in Dropbox'),
  svc('box', 'Box', Boxes, 'Dateien & Cloud', 'Dateien in Box'),
  svc('nextcloud', 'Nextcloud', Cloud, 'Dateien & Cloud', 'Eigene Cloud'),

  // Chat & Team
  svc('slack', 'Slack', Hash, 'Chat & Team', 'Nachrichten in Slack'),
  svc('teams', 'Microsoft Teams', Users, 'Chat & Team', 'Chats in Teams'),
  svc('discord', 'Discord', MessageSquare, 'Chat & Team', 'Nachrichten in Discord'),
  svc('telegram', 'Telegram', Send, 'Chat & Team', 'Nachrichten in Telegram'),
  svc('zoom', 'Zoom', Video, 'Chat & Team', 'Meetings'),

  // Produktivität & Aufgaben
  svc('notion', 'Notion', ListTodo, 'Produktivität & Aufgaben', 'Seiten & Datenbanken'),
  svc('trello', 'Trello', ListTodo, 'Produktivität & Aufgaben', 'Boards & Karten'),
  svc('asana', 'Asana', ListTodo, 'Produktivität & Aufgaben', 'Aufgaben & Projekte'),
  svc('linear', 'Linear', ListTodo, 'Produktivität & Aufgaben', 'Tickets & Projekte'),
  svc('todoist', 'Todoist', ListTodo, 'Produktivität & Aufgaben', 'To-dos'),
  svc('clickup', 'ClickUp', LayoutGrid, 'Produktivität & Aufgaben', 'Aufgaben & Docs'),
  svc('jira', 'Jira', LayoutGrid, 'Produktivität & Aufgaben', 'Issues & Sprints'),
  svc('confluence', 'Confluence', FileText, 'Produktivität & Aufgaben', 'Wiki & Dokumente'),

  // Entwicklung
  svc('github', 'GitHub', Code2, 'Entwicklung', 'Repos, Issues, PRs'),
  svc('gitlab', 'GitLab', GitBranch, 'Entwicklung', 'Repos & Pipelines'),
  svc('bitbucket', 'Bitbucket', GitBranch, 'Entwicklung', 'Repos & Pipelines'),

  // Vertrieb & CRM
  svc('hubspot', 'HubSpot', Briefcase, 'Vertrieb & CRM', 'Kontakte & Deals'),
  svc('salesforce', 'Salesforce', Target, 'Vertrieb & CRM', 'CRM-Daten'),
  svc('pipedrive', 'Pipedrive', Target, 'Vertrieb & CRM', 'Vertriebspipeline'),
  svc('zoho', 'Zoho CRM', Briefcase, 'Vertrieb & CRM', 'CRM-Daten'),

  // Marketing & Social
  svc('linkedin', 'LinkedIn', Megaphone, 'Marketing & Social', 'Beiträge & Kontakte'),
  svc('x', 'X (Twitter)', Megaphone, 'Marketing & Social', 'Beiträge'),
  svc('mailchimp', 'Mailchimp', Send, 'Marketing & Social', 'Newsletter'),
  svc('buffer', 'Buffer', Megaphone, 'Marketing & Social', 'Social-Planung'),

  // Finanzen & Commerce
  svc('stripe', 'Stripe', CreditCard, 'Finanzen & Commerce', 'Zahlungen'),
  svc('paypal', 'PayPal', CreditCard, 'Finanzen & Commerce', 'Zahlungen'),
  svc('shopify', 'Shopify', ShoppingCart, 'Finanzen & Commerce', 'Shop & Bestellungen'),
  svc('lexoffice', 'lexoffice', Receipt, 'Finanzen & Commerce', 'Buchhaltung (DE)'),
  svc('quickbooks', 'QuickBooks', Receipt, 'Finanzen & Commerce', 'Buchhaltung'),

  // Wissen & Support
  svc('gsheets', 'Google Sheets', FileSpreadsheet, 'Wissen & Support', 'Tabellen'),
  svc('airtable', 'Airtable', LayoutGrid, 'Wissen & Support', 'Datenbank-Tabellen'),
  svc('zendesk', 'Zendesk', LifeBuoy, 'Wissen & Support', 'Support-Tickets'),
  svc('intercom', 'Intercom', Headphones, 'Wissen & Support', 'Kunden-Chat'),

  // Sonstiges
  {
    id: 'custom',
    name: 'Eigener Dienst',
    icon: Boxes,
    category: 'Sonstiges',
    desc: 'Beliebiger MCP-Server per Adresse',
    urlPlaceholder: 'https://…/mcp oder http://127.0.0.1:…/mcp',
    hint: 'Adresse eines beliebigen MCP-Servers. Lokale Server (127.0.0.1) dürfen http sein.',
    needsToken: false
  }
]
