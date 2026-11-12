import {
  Activity,
  Bot,
  Boxes,
  FileText,
  GitBranch,
  LayoutDashboard,
  Network,
  Rocket,
  Server,
  Settings,
  Shield,
  Siren,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  phase: number;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export function getNavGroups(orgSlug: string): NavGroup[] {
  const base = `/${orgSlug}`;
  return [
    {
      label: 'Operate',
      items: [
        { title: 'Overview', href: `${base}/overview`, icon: LayoutDashboard, phase: 2 },
        { title: 'Infrastructure', href: `${base}/infrastructure`, icon: Server, phase: 3 },
        { title: 'Applications', href: `${base}/applications`, icon: Boxes, phase: 5 },
        { title: 'Deployments', href: `${base}/deployments`, icon: Rocket, phase: 5 },
      ],
    },
    {
      label: 'Observe',
      items: [
        { title: 'Monitoring', href: `${base}/monitoring`, icon: Activity, phase: 4 },
        { title: 'Logs', href: `${base}/logs`, icon: FileText, phase: 7 },
        { title: 'Traces', href: `${base}/traces`, icon: GitBranch, phase: 7 },
        { title: 'Topology', href: `${base}/topology`, icon: Network, phase: 10 },
      ],
    },
    {
      label: 'Respond',
      items: [
        { title: 'Incidents', href: `${base}/incidents`, icon: Siren, phase: 8 },
        { title: 'AI Engineer', href: `${base}/ai-engineer`, icon: Bot, phase: 9 },
        { title: 'Automation', href: `${base}/automation`, icon: Workflow, phase: 8 },
      ],
    },
    {
      label: 'Admin',
      items: [
        { title: 'Security', href: `${base}/security`, icon: Shield, phase: 2 },
        { title: 'Settings', href: `${base}/settings`, icon: Settings, phase: 2 },
      ],
    },
  ];
}
