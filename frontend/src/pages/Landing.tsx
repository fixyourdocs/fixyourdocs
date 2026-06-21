import { useRef, useState } from 'react';
import { Button } from '../components/Button';
import {
  Play,
  Send,
  Github,
  BookOpen,
  Bot,
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

const TRY_IT_CURL = `curl -X POST https://hub.fixyourdocs.io/v1/reports \\
  -H 'Content-Type: application/json' \\
  -d '{
    "protocol_version": "0",
    "doc_url": "https://demo-libraryx.com/payments",
    "agent": { "name": "claude-code" },
    "report": {
      "kind": "outdated",
      "summary": "Payments guide still shows the v1 charge flow (change me to avoid dedup)"
    }
  }'`;

export function Landing() {
  return (
    <>
      <Hero />
      <TryIt />
      <MaintainerSetup />
      <Spec />
      <HowItWorks />
      <ForAgents />
      <Footer />
    </>
  );
}

function Hero() {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
            When agents hit broken docs, maintainers hear about it.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            An agent reports to FixYourDocs, and FixYourDocs opens an issue in the maintainer's
            repo. Watch the demo below to see the whole loop in action.
          </p>
        </div>
        <div className="mt-10 max-w-3xl">
          <VideoEmbed
            src="/demo.mp4"
            poster="/demo-poster.png"
            ariaLabel="Demo: an AI agent hits a stale LibraryX doc, fixes its own code, and files a structured report that opens a GitHub issue."
          />
          <div className="mt-8 flex justify-center">
            <a href="https://docs.fixyourdocs.io/getting-started/" target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button size="lg">Get started</Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function VideoEmbed({
  src,
  poster,
  ariaLabel,
}: {
  src: string;
  poster?: string;
  ariaLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function play() {
    videoRef.current?.play();
    setPlaying(true);
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-900 shadow-sm">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          poster={poster}
          controls={playing}
          playsInline
          preload="metadata"
          width={1080}
          height={1080}
          onPlay={() => setPlaying(true)}
          aria-label={ariaLabel}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support embedded video. Watch it on{' '}
          <a href={`https://fixyourdocs.io${src}`}>{`fixyourdocs.io${src}`}</a>.
        </video>

        {!playing && (
          <button
            type="button"
            onClick={play}
            aria-label="Play the demo"
            className="group absolute inset-0 flex items-center justify-center bg-slate-900/30 transition-colors hover:bg-slate-900/20 focus-visible:outline-none"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-sky-700 shadow-lg ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-105">
              <Play size={32} className="ml-1" fill="currentColor" aria-hidden />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function TryIt() {
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Send size={22} className="text-sky-700" /> Try it in 30 seconds
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          Paste this into a terminal. It files a report against our live demo doc —
          and because that demo's domain is verified, a new public GitHub Issue
          lands on the demo repo within ~30 seconds of submitting.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100 ring-1 ring-slate-700">
          <code>{TRY_IT_CURL}</code>
        </pre>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
          Heads up: this opens a <strong>public</strong> Issue on the demo repo —
          it exists for exactly this, so go ahead. Change the{' '}
          <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">summary</code> so
          the Hub doesn't de-duplicate your report against an identical one.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="https://github.com/fyd-demo-maintainer/demo-libraryx/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button>Watch it land →</Button>
          </a>
          <a
            href="https://demo-libraryx.com/payments"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <Button variant="secondary">See the stale demo doc</Button>
          </a>
        </div>
      </div>
    </section>
  );
}

function MaintainerSetup() {
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Github size={22} className="text-sky-700" /> Receive reports on your own repo
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          The other side of the loop: connect your repo, verify you own your docs, and
          every report against them lands as a GitHub Issue you triage with the tools you
          already use. This walkthrough takes you through the one-time Hub setup, end to end.
        </p>
        <div className="mt-8 max-w-3xl">
          <VideoEmbed
            src="/maintainer-setup.mp4"
            ariaLabel="Walkthrough: a maintainer connects the FixYourDocs GitHub App, verifies their docs domain, and receives a docs-feedback report as a GitHub Issue."
          />
          <div className="mt-8 flex justify-center">
            <a
              href="https://docs.fixyourdocs.io/hub/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button size="lg">Read the Hub guide</Button>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Spec() {
  return (
    <section className="bg-slate-50 py-16">
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

function HowItWorks() {
  const modes = [
    {
      icon: <Github size={20} />,
      tag: 'Mode A',
      t: 'You maintain the docs',
      d: 'Wire your repo and verify you own your docs. Agents working in your repo offer — with the developer\'s OK — to report your docs, and each report lands as a GitHub Issue you triage.',
    },
    {
      icon: <Bot size={20} />,
      tag: 'Mode B',
      t: 'You build with agents',
      d: "Wire your own agent once, globally. When it consults a third-party public doc and hits a problem, it offers — with your OK — to report it to whoever owns that doc.",
    },
  ];
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How it works</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
          One protocol, two ways to adopt it. Pick the side you're on — many people are on both.
        </p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {modes.map((m) => (
            <div key={m.tag} className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-50 text-sky-700">{m.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-sky-700">{m.tag}</span>
              </div>
              <p className="mt-3 text-base font-semibold text-slate-900">{m.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-slate-600">
          Either way the same report flows to the doc's owner: the agent files a structured
          report, the Hub matches its doc URL to a verified owner, and it opens a GitHub Issue.
          Reports always need a human OK before they're sent.
        </p>
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
            Building with agents? Wire <strong>Mode B</strong> once, globally, so your agent
            offers to report the broken third-party docs it hits across every project. Add two
            things to your <em>global</em> agent config:
          </p>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            <li>
              <span className="font-semibold text-slate-900">1. The consumer-side snippet.</span>{' '}
              The Mode B AGENTS.md block — public docs only, asks before sending. Install it into
              your global config (e.g. <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">~/.claude/CLAUDE.md</code>):
              <code className="mt-2 block break-all rounded bg-white p-2 font-mono text-xs ring-1 ring-slate-200">
                npx @fixyourdocs/sdk init --global
              </code>
            </li>
            <li>
              <span className="font-semibold text-slate-900">2. The MCP server.</span>{' '}
              The recommended carrier — it runs locally over stdio via{' '}
              <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">npx</code>, exposes{' '}
              <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">file_doc_feedback</code>, and
              enforces the consent + public-docs-only guards. No auth — anonymous, rate-limited at
              the hub. Add it with the config on the right.
            </li>
          </ol>
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

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-10">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-slate-500">
        <p>FixYourDocs Maciek Stopa</p>
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
