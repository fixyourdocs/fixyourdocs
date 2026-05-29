import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import {
  CheckCircle2,
  FileText,
  Send,
  Github,
  Play,
  BookOpen,
  Package,
  Sparkles,
} from 'lucide-react';

const MCP_CONFIG = `{
  "mcpServers": {
    "fixyourdocs": {
      "command": "npx",
      "args": ["-y", "@fixyourdocs/mcp-server"]
    }
  }
}`;

const CODEX_CONFIG = `[mcp_servers.fixyourdocs]
command = "npx"
args = ["-y", "@fixyourdocs/mcp-server"]`;

const SAMPLE_REPORT_JSON = `{
  "protocol_version": "0",
  "doc_url": "https://docs.example.com/sso/setup",
  "agent": { "name": "claude-code" },
  "report": {
    "kind": "outdated",
    "summary": "Step 4 references a 'Save and Apply' button that no longer exists"
  }
}`;

export function Landing() {
  return (
    <>
      <Hero />
      <Spec />
      <SDK />
      <WhyNow />
      <HowItWorks />
      <ForAgents />
      <SampleReport />
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-12 pt-20 sm:pt-28">
      <div className="max-w-3xl">
        <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-600" />
          A feedback channel for the agents already reading your docs
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
          When agents hit broken docs, you hear about it.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-slate-600">
          Open protocol, reference SDKs, and a hosted hub for turning every agent run on your docs
          into a structured signal you can act on.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/signup">
            <Button>Connect your docs repo</Button>
          </Link>
          <a href="https://docsfeedback.org" target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">Read the protocol</Button>
          </a>
        </div>
      </div>
      <DemoEmbed />
    </section>
  );
}

function DemoEmbed() {
  return (
    <div className="mt-12">
      <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
        <div className="aspect-video w-full">
          <div
            role="img"
            aria-label="A 60-second demo of FixYourDocs is in production. Coming soon."
            className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-sky-700 shadow-sm">
              <Play size={22} aria-hidden />
            </span>
            <p className="text-sm font-medium">60-second demo — coming soon.</p>
            <p className="text-xs text-slate-500">
              An agent files a report against a live docs page; the maintainer fixes it on stream.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Spec() {
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:grid-cols-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <BookOpen size={22} className="text-sky-700" /> The protocol
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            The Docs Feedback Protocol is an open spec for agent-to-maintainer documentation reports.
            One JSON shape, a single <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /v1/reports</code> endpoint,
            and a stable set of error codes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="https://docsfeedback.org" className="inline-flex">
              <Button>Read the spec</Button>
            </a>
            <a href="https://github.com/fixyourdocs/protocol" className="inline-flex">
              <Button variant="secondary">View on GitHub</Button>
            </a>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Wire-format example (v0)
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100 ring-1 ring-slate-700">
            <code>{SAMPLE_REPORT_JSON}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

function SDK() {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Package size={22} className="text-sky-700" /> Reference SDKs
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          Apache-2.0 reference clients for the two ecosystems most AI agents already speak. Both ship
          a <code className="rounded bg-white px-1 py-0.5 text-xs ring-1 ring-slate-200">fixyourdocs</code> CLI
          for the paste-into-AGENTS.md flow.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Card>
            <CardBody>
              <p className="text-sm font-semibold text-slate-900">Python</p>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                <code>pip install fixyourdocs</code>
              </pre>
              <a
                href="https://github.com/fixyourdocs/sdk-python"
                className="mt-3 inline-block text-xs text-sky-700 hover:underline"
              >
                fixyourdocs/sdk-python →
              </a>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-sm font-semibold text-slate-900">TypeScript</p>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
                <code>npm install @fixyourdocs/sdk</code>
              </pre>
              <a
                href="https://github.com/fixyourdocs/sdk-typescript"
                className="mt-3 inline-block text-xs text-sky-700 hover:underline"
              >
                fixyourdocs/sdk-typescript →
              </a>
            </CardBody>
          </Card>
        </div>
      </div>
    </section>
  );
}

function WhyNow() {
  const bullets = [
    'Agents already read AGENTS.md in 60 000+ repos — a single paste-ready block opens the channel.',
    'MCP is now standard in Claude, Cursor, Codex, and Devin — a structured report is one tool call.',
    'No competing open spec exists; whoever defines the shape now sets the default.',
  ];
  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Sparkles size={22} className="text-sky-700" /> Why now
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {bullets.map((b) => (
            <li
              key={b}
              className="rounded-lg border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700"
            >
              {b}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-600">
          Full argument:{' '}
          <a
            href="https://github.com/fixyourdocs/manifesto/blob/main/MANIFESTO.md"
            className="text-sky-700 hover:underline"
          >
            read the manifesto
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Github size={20} />,
      t: 'Connect your docs repo',
      d: 'Sign up, install the FixYourDocs GitHub App, verify your docs domain (a DNS-TXT record), and pick the repo where reports should land.',
    },
    {
      icon: <Send size={20} />,
      t: 'Agents file structured reports',
      d: 'Any MCP-aware agent can call file_doc_feedback when it hits a broken doc — no API keys, rate-limited at source.',
    },
    {
      icon: <CheckCircle2 size={20} />,
      t: 'Reports land as GitHub Issues',
      d: "Each report whose doc URL is on a domain you've verified is forwarded to a GitHub Issue on your connected repo, so you triage it with the tools you already use.",
    },
  ];
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How it works</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.t} className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-700">{s.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Step {i + 1}</span>
              </div>
              <p className="mt-3 text-base font-semibold text-slate-900">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ForAgents() {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 sm:grid-cols-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">For AI agents</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Add the FixYourDocs MCP server to your client. It runs locally over stdio via{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">npx</code> and exposes one tool:{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">file_doc_feedback</code>. No authentication needed —
            anonymous submission, rate-limited at the hub.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Install:{' '}
            <code className="block break-all rounded bg-white p-2 font-mono text-xs ring-1 ring-slate-200">
              npx -y @fixyourdocs/mcp-server
            </code>
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Claude Desktop &middot; Cursor
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100 ring-1 ring-slate-700">
              <code>{MCP_CONFIG}</code>
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Codex &middot; <code className="normal-case">~/.codex/config.toml</code>
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100 ring-1 ring-slate-700">
              <code>{CODEX_CONFIG}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function SampleReport() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">What a report looks like</h2>
        <p className="mt-2 text-sm text-slate-600">An agent finds a stale screenshot reference. Here's the report they file.</p>

        <Card className="mt-6">
          <CardBody>
            <div className="flex items-start gap-3">
              <FileText size={18} className="mt-0.5 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Step 4 mentions a "Save and Apply" button that no longer exists</p>
                <p className="mt-1 truncate text-xs text-slate-500">https://docs.acme.com/sso/setup</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-500">outdated</span>
                  <span className="text-xs text-slate-500">3h ago</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                  The docs say to click "Save and Apply" after entering the metadata URL, but the current UI only has a single
                  "Save" button. The user was stuck because they kept looking for "Apply".
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-slate-500">
        <p>FixYourDocs &middot; V1 &middot; us-east-1</p>
        <nav className="flex items-center gap-4">
          <a
            href="https://docsfeedback.org"
            className="hover:text-slate-700"
          >
            Spec
          </a>
          <a
            href="https://github.com/fixyourdocs/manifesto"
            className="hover:text-slate-700"
          >
            Manifesto
          </a>
          <a
            href="https://github.com/fixyourdocs"
            className="inline-flex items-center gap-1 hover:text-slate-700"
          >
            <Github size={14} /> GitHub
          </a>
          <a
            href="https://github.com/fixyourdocs/fixyourdocs/issues/new"
            className="hover:text-slate-700"
          >
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
