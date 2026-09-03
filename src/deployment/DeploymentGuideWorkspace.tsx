import type { ReactNode } from "react";

const CONTENTS = [
  { id: "guide-rules", label: "The five rules" },
  { id: "guide-config-model", label: "Configuration model — public, private, secret" },
  { id: "guide-part-0", label: "Part 0 — Accounts and tools" },
  { id: "guide-part-1", label: "Part 1 — Get the code" },
  { id: "guide-verify-local", label: "Verify locally before you deploy" },
  { id: "guide-part-2", label: "Part 2 — Create the Supabase project" },
  { id: "guide-part-3", label: "Part 3 — Apply the database migrations" },
  { id: "guide-part-4", label: "Part 4 — Deploy to Vercel" },
  { id: "guide-part-5", label: "Part 5 — Create your Commander identity" },
  { id: "guide-part-6", label: "Part 6 — Initial import" },
  { id: "guide-part-7", label: "Part 7 — Connect the Claude agent" },
  { id: "guide-part-8", label: "Part 8 — Final verification checklist" },
  { id: "guide-part-9", label: "Part 9 — Troubleshooting" },
  { id: "guide-part-10", label: "Part 10 — What never to do" },
  { id: "guide-next", label: "Where to go next" },
] as const;

function Code({ children }: { children: string }) {
  return <div className="guide-code"><pre><code>{children}</code></pre></div>;
}

function Scroll({ children }: { children: ReactNode }) {
  return <div className="guide-scroll">{children}</div>;
}

function Note({ children }: { children: ReactNode }) {
  return <aside className="guide-note">{children}</aside>;
}

function Alert({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="guide-alert" role="note"><strong className="guide-alert-title">{title}</strong><div>{children}</div></aside>;
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return <section className="guide-section" id={id} aria-labelledby={`${id}-title`}>
    <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2 id={`${id}-title`}>{title}</h2></div></div>
    {children}
  </section>;
}

export function DeploymentGuideWorkspace() {
  return <>
    <div className="page-heading guide-title">
      <div>
        <span className="eyebrow">Commander reference · reading surface only</span>
        <h1>Deployment Guide</h1>
        <p>CASTRA — New Commander First Deployment Guide. For a Commander deploying CASTRA for the first time who has never deployed a web application before. No prior knowledge of Supabase, Vercel, PostgreSQL, or the command line is assumed. Every command is given in full.</p>
      </div>
      <span className="guide-stamp">REFERENCE ONLY · NO PROVIDER ACTION</span>
    </div>

    <section className="guide-meta-banner">
      <div><span>What you will have at the end</span><strong>A running CASTRA instance</strong><small>On your own domain, with your Commander identity, durable operational state, and a Claude agent able to read live operational state through a fail-closed, read-only surface.</small></div>
      <div><span>Time</span><strong>Two to three hours</strong><small>Budget that for a first run. Most of it is waiting for deployments.</small></div>
      <div><span>Provenance</span><strong>A real first deployment</strong><small>Written 2026-08-19, including every place that one went wrong. The Troubleshooting section is not hypothetical.</small></div>
      <div><span>Preview limitation</span><strong>Internal deployment guide not distributed</strong><small>See <code>DATA-SCOPE.md</code> for the public boundary. This reading surface performs no provider action.</small></div>
    </section>

    <nav className="guide-contents" aria-label="Deployment Guide contents">
      <span className="eyebrow">Contents</span>
      <ul>{CONTENTS.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ul>
    </nav>

    <Section id="guide-rules" eyebrow="Read these first" title="The five rules that prevent almost every failure">
      <ol className="guide-rules">
        <li><strong>Order matters more than anything else.</strong> Migrations apply in filename order. The agent acceptance artifact runs <em>before</em> the key is registered. Getting either wrong is recoverable, but costs a rollback cycle.</li>
        <li><strong>Use Git Bash on Windows.</strong> Not Command Prompt, not PowerShell. Every documented command is POSIX. Translating them is how you get a silent mismatch.</li>
        <li><strong>Environment variables only take effect on a new deployment.</strong> Adding one to a running service changes nothing until you redeploy.</li>
        <li><strong>The raw key and its digest are different values.</strong> They are both 64 hex characters, which is exactly why people swap them. The database gets the digest. The server gets the raw key. Never the reverse.</li>
        <li><strong>When a step says &ldquo;verify&rdquo;, verify.</strong> Every check in this guide exists because skipping it produced a confusing failure later.</li>
      </ol>
    </Section>

    <Section id="guide-config-model" eyebrow="Read these second" title="Configuration model — what is public, what is private, and what is a secret">
      <p>CASTRA ships <strong>neutral defaults</strong>. You do not inherit anyone else&rsquo;s provider, account, voice, storage, or deployment choice, and nothing in this guide selects one for you. Every configurable capability is a <em>class</em> — a shape of component — and the specific product inside that class is your decision to make and to record.</p>
      <p>Four kinds of configuration value are kept apart on purpose. Confusing them is how private information ends up in a public place.</p>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Value class</th><th scope="col">What it is</th><th scope="col">Where it lives</th><th scope="col">May appear in public output?</th></tr></thead>
          <tbody>
            <tr><th scope="row">Public default</th><td>the neutral option CASTRA Core ships</td><td>the repository</td><td>yes</td></tr>
            <tr><th scope="row">Sanitized example</th><td>a synthetic illustration with no real identifier</td><td>documentation</td><td>yes</td></tr>
            <tr><th scope="row">Private Commander selection</th><td>the answers <em>you</em> chose for <em>your</em> deployment</td><td>your own private Deployment Pack</td><td><strong>no</strong></td></tr>
            <tr><th scope="row">Secret</th><td>keys, tokens, signing material, digests</td><td>your environment or secret store only</td><td><strong>never</strong></td></tr>
          </tbody>
        </table>
      </Scroll>
      <p>CASTRA Core, optional adapters, your private Deployment Pack, and your operational store are physically and logically separate. None of the four is a substitute for another, and Core never ships a Commander&rsquo;s selections.</p>

      <h3>Decide these before you choose any provider</h3>
      <p>The Agent Configuration page states all eleven for every option <em>before</em> anything can be marked. Ask the same eleven of any product you are considering:</p>
      <ul className="guide-checklist">
        <li>capability class — what the component actually does</li>
        <li>compatibility — which runtime or adapter class it fits</li>
        <li>authority impact — CASTRA&rsquo;s answer is always &ldquo;none&rdquo;; check that the product does not assume otherwise</li>
        <li>data sent — exactly what leaves your deployment</li>
        <li>retention — how long the receiving party keeps it, in their words</li>
        <li>commercial rights — what you may do with the output, and what they may do with your input</li>
        <li>cost class — free, already-subscribed, metered, or unknown</li>
        <li>recovery and exit — how you leave, and what you can take with you</li>
        <li>deployment implication — what it adds to run, secure, and redeploy</li>
        <li>qualification state — whether <em>you</em> have verified it, not whether someone else did</li>
        <li>value classification — which of the four rows above the resulting setting belongs to</li>
      </ul>
      <Alert title="Secrets have exactly one home">
        <p>A key, token, digest, password, or signing value belongs in your deployment&rsquo;s environment or secret store and nowhere else. Never put one in a repository file, a receipt, a chat, a screenshot, an issue, or a CASTRA field. CASTRA never needs one to render a page, and no agent needs one at all.</p>
      </Alert>

      <h3>Voice is configurable, and the two voice paths are not the same thing</h3>
      <p><strong>Regular SARGE voice</strong> is an ordinary, replaceable capability. The public default is <strong>no synthesized voice at all</strong>: CASTRA is fully usable as text. If you want spoken output, the class — platform-local, self-hosted, or a hosted service — and the particular voice and rate are <em>your</em> private selection. Another deployment&rsquo;s voice choice is that Commander&rsquo;s private default, never a public default, and is never shipped to you.</p>
      <p>A <strong>cloned or likeness-derived DJ SARGE voice is a different capability</strong> with different consent, likeness, rights-provenance, and retention questions. It is not available, is not implied by any regular-voice selection, and cannot be enabled from the configuration surface. Enabling such a path would require its own separate Commander authorization first.</p>
      <p>Three interaction rules hold in every mode, including when no voice is configured:</p>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Rule</th><th scope="col">What it means</th><th scope="col">What must never be claimed</th></tr></thead>
          <tbody>
            <tr><th scope="row">Push-to-talk</th><td>capture happens only while you hold the control</td><td>an idle or released control is never &ldquo;listening&rdquo;</td></tr>
            <tr><th scope="row">Editable confirmation</th><td>you correct the text, then confirm it deliberately</td><td>a transcript is never treated as confirmed input</td></tr>
            <tr><th scope="row">Typed fallback</th><td>typing always works and is a complete interaction</td><td>a typed interaction is never reported as a completed voice outcome</td></tr>
          </tbody>
        </table>
      </Scroll>
      <Note><strong>Additional spend for the configuration surface itself is $0.</strong> Reading, comparing, or marking an option activates no provider, opens no account, and incurs no charge. Any cost comes from a provider <em>you</em> separately choose and pay, under terms you have read.</Note>
    </Section>

    <Section id="guide-part-0" eyebrow="Part 0" title="Accounts and tools">
      <h3>Accounts you need</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Service</th><th scope="col">Purpose</th><th scope="col">Free tier sufficient?</th></tr></thead>
          <tbody>
            <tr><th scope="row">GitHub</th><td>holds the code</td><td>yes</td></tr>
            <tr><th scope="row">Supabase</th><td>database, authentication</td><td>yes</td></tr>
            <tr><th scope="row">Vercel</th><td>hosting, serverless functions</td><td>yes</td></tr>
            <tr><th scope="row">Anthropic (Claude)</th><td>the agent that reads your state</td><td>separate subscription</td></tr>
          </tbody>
        </table>
      </Scroll>

      <h3>Tools to install</h3>
      <p><strong>Git for Windows</strong> — <code>https://git-scm.com/download/win</code></p>
      <p>Accept the defaults. This gives you <strong>Git Bash</strong>, which you will use for every command in this guide. To open it: right-click any folder → <strong>Git Bash Here</strong>, or find &ldquo;Git Bash&rdquo; in the Start menu.</p>
      <Note><strong>Why this matters.</strong> CASTRA&rsquo;s cryptographic commands use <code>printf</code>, <code>openssl</code>, and <code>sha256sum</code>. Command Prompt has none of them. If you see <code>'export' is not recognized as an internal or external command</code>, you are in the wrong shell.</Note>
      <p><strong>A text editor</strong> — VS Code (<code>https://code.visualstudio.com</code>) is fine. You will barely need it; this guide avoids editors where possible.</p>
    </Section>

    <Section id="guide-part-1" eyebrow="Part 1" title="Get the code">
      <p>Open <strong>Git Bash</strong> and run, one line at a time:</p>
      <Code>{`cd ~/Documents
git clone https://github.com/<owner>/<repo>.git castra
cd castra`}</Code>
      <p>Replace <code>&lt;owner&gt;/&lt;repo&gt;</code> with your repository.</p>
      <p>If you already have the folder from earlier, update it instead:</p>
      <Code>{`cd ~/Documents/castra
git checkout main
git pull origin main`}</Code>
      <p><strong>Verify</strong> you have the current files:</p>
      <Code>{`ls supabase/migrations/`}</Code>
      <p>You should see six <code>.sql</code> files. If you see fewer, your <code>git pull</code> did not succeed — do not continue until it does.</p>
    </Section>

    <Section id="guide-verify-local" eyebrow="Before you deploy" title="Verify locally — reproducible, credential-free, and honest about results">
      <p>Everything in this section runs on your own machine, needs no account, no key, and no provider, and touches nothing outside the repository folder. Run it before Part 2 so that a later failure is a <em>deployment</em> problem rather than an unknown one.</p>
      <Alert title="This guide records no result for your machine">
        <p>The commands below are the ones this repository actually defines. Their outcome on your computer is something only you can observe. Write down what you actually see — a passing run is evidence, a remembered impression is not, and no document can pass a check on your behalf.</p>
      </Alert>

      <h3>Toolchain the repository expects</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Tool</th><th scope="col">Declared requirement</th><th scope="col">Check it with</th></tr></thead>
          <tbody>
            <tr><th scope="row">Node.js</th><td><code>{">=24.18.0 <25"}</code></td><td><code>node --version</code></td></tr>
            <tr><th scope="row">npm</th><td><code>11.16.0</code></td><td><code>npm --version</code></td></tr>
          </tbody>
        </table>
      </Scroll>
      <p>A different major Node version is the most common cause of a confusing local failure. Fix the version before investigating anything else.</p>

      <h3>Install, build, and test</h3>
      <Code>{`npm ci
npm run build
npm test`}</Code>
      <p><code>npm ci</code> installs exactly the locked dependency set. <code>npm run build</code> runs the TypeScript project build and then the bundler build. <code>npm test</code> runs the unit suite and then the companion suite; both must be looked at, because a script that stops early can still print a lot of green above the failure.</p>
      <p>To run a single focused suite while you are working — for example the Agent Configuration classification and disclosure checks:</p>
      <Code>{`npx vitest run src/presentation/agentConfiguration.test.ts`}</Code>
      <p>That suite is pure: it starts no server, opens no socket, reads no environment variable, and uses only synthetic fixtures.</p>

      <h3>Verification registry and impacted-module plan</h3>
      <Code>{`npm run verify:module-registry`}</Code>
      <p>This validates that every governed file has exactly one owning module, with no gap and no overlap. It must report complete, non-overlapping ownership before any impacted plan is executable.</p>
      <Code>{`npm run plan:verification`}</Code>
      <p>The planner refuses to plan from an unbound input. It requires a digest-bound trust root — either a request file together with its expected SHA-256, or a candidate receipt together with its expected SHA-256 — and it fails closed to the declared full plan whenever a changed file is unmapped or ambiguously owned, the registry is invalid, verification tooling or build configuration changed, or a release, cutover, incident, recovery, or audit trigger applies. A plan that escalates is behaving correctly, not misbehaving.</p>
      <Note>Adding a genuinely new area of the repository is expected to escalate the plan until ownership is declared for it. Escalation is the fail-closed default, and widening the registry to avoid an escalation is exactly the wrong repair.</Note>

      <h3>Run it in a browser, locally</h3>
      <Code>{`npm run dev`}</Code>
      <p>Open the address the command prints. Without an activated store the application runs on the local, non-authoritative candidate path and labels itself that way — that label is correct behaviour, not a defect. To inspect the built output rather than the dev server:</p>
      <Code>{`npm run build
npm run preview`}</Code>
      <p className="guide-emphasis">A control that exists only in source has not shipped. If you changed behaviour, confirm it in the <strong>built</strong> bundle before believing it.</p>

      <h3>Checking the in-page agent tool surface</h3>
      <p>CASTRA registers a read-and-propose tool surface against the browser&rsquo;s model-context API when the browser provides one. Four things must all be true, bound to one exact commit, before that surface may be described as enabled:</p>
      <ol className="guide-steps">
        <li>lifecycle-safe registration is present in the <strong>built</strong> application, not only in source;</li>
        <li>a supported browser discovers the exact registered tool manifest;</li>
        <li>at least one read-only tool invocation succeeds through that surface; and</li>
        <li>deterministic contract verification shows the tool surface cannot directly mutate hosted state.</li>
      </ol>
      <p>Until all four are captured together, the honest statement is that the surface is implemented and not yet enabled. A browser that does not provide the capability is detected and refused with a stable reason code; that refusal is the designed behaviour and must not be worked around with a shim.</p>
      <p className="guide-emphasis">No tool on that surface can close, approve, allocate, deploy, publish, spend, or reach a credential. If a change would add such a path, it is a different decision, not a configuration change.</p>
    </Section>

    <Section id="guide-part-2" eyebrow="Part 2" title="Create the Supabase project">
      <ol className="guide-steps">
        <li>Go to <code>https://supabase.com</code> and sign in.</li>
        <li><strong>New project</strong>. Give it a name, set a strong database password, pick the region closest to you.</li>
        <li>Wait for provisioning (1–2 minutes).</li>
        <li>Go to <strong>Project Settings → API</strong> and copy these two values somewhere safe:
          <ul>
            <li><strong>Project URL</strong> → this is your <code>SUPABASE_URL</code></li>
            <li><strong>Publishable / anon key</strong> → this is your <code>SUPABASE_PUBLISHABLE_KEY</code></li>
          </ul>
        </li>
      </ol>
      <Note><strong>Never copy the service-role key</strong> — the elevated server key Supabase lists beside the publishable/anon key, spelled there as one lower-case word with an underscore. CASTRA does not use it and refuses it by construction. If you ever paste a value beginning <code>sb_secret_</code> or <code>eyJ</code> into a CASTRA key field, the server will reject it.</Note>
    </Section>

    <Section id="guide-part-3" eyebrow="Part 3" title="Apply the database migrations">
      <p>All six migrations go through the Supabase <strong>SQL Editor</strong>, in filename order.</p>

      <h3>The copy trick</h3>
      <p>Rather than opening files in an editor and risking a partial selection, copy each file straight to your clipboard from Git Bash:</p>
      <Code>{`cat supabase/migrations/<filename>.sql | clip`}</Code>
      <p>On macOS or Linux use <code>pbcopy</code> or <code>xclip -selection clipboard</code> instead of <code>clip</code>.</p>

      <h3>The order — do not deviate</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">#</th><th scope="col">File</th><th scope="col">What it does</th></tr></thead>
          <tbody>
            <tr><td>1</td><td><code>202608100001_castra_hosted_control_plane_phase1.sql</code></td><td>control-plane foundation</td></tr>
            <tr><td>2</td><td><code>202608100002_castra_auth_identity_authority.sql</code></td><td>identity and authority tables</td></tr>
            <tr><td>3</td><td><code>202608140001_castra_single_commander_authority_binding.sql</code></td><td>binds a single Commander</td></tr>
            <tr><td>4</td><td><code>202608150001_castra_durable_operational_state.sql</code></td><td>the operational state store</td></tr>
            <tr><td>5</td><td><code>202608150002_castra_initial_import_step_up_one_use.sql</code></td><td>one-use initial import path</td></tr>
            <tr><td>6</td><td><code>202608180001_castra_agent_store_read_path.sql</code></td><td>the agent read path</td></tr>
          </tbody>
        </table>
      </Scroll>

      <h3>For each migration</h3>
      <ol className="guide-steps">
        <li>In Supabase, click <strong>SQL Editor</strong> → <strong>New query</strong></li>
        <li>Paste (<strong>Ctrl+V</strong>)</li>
        <li><strong>Verify the last line of the pasted text is <code>commit;</code></strong>. If it is not, the paste truncated — re-copy and paste again.</li>
        <li>Click <strong>Run</strong></li>
        <li>Expect <strong><code>Success. No rows returned.</code></strong></li>
      </ol>
      <p>Every migration is wrapped in a single transaction. It either fully applies or fully rolls back. There is no half-applied state to clean up.</p>

      <h3>If you see a &ldquo;Potential issues detected&rdquo; warning</h3>
      <p>Supabase&rsquo;s linter may warn about <code>UPDATE</code> without a <code>WHERE</code> clause, or tables created without row-level security, and offer <strong>Cancel / Run without RLS / Run and enable RLS</strong>.</p>
      <p className="guide-emphasis">Choose &ldquo;Run without RLS&rdquo;.</p>
      <p>The warnings concern temporary scratch tables that exist only inside the transaction. Choosing &ldquo;Run and enable RLS&rdquo; makes the editor <strong>inject extra statements into the file</strong>, which means you are no longer running the artifact that was verified — and on a temporary table it can break the script&rsquo;s own final <code>select</code>.</p>

      <h3>Run the acceptance artifacts</h3>
      <p>Four migrations have matching acceptance artifacts in <code>supabase/acceptance/</code>. Each is a self-checking transaction ending in <code>rollback;</code> — it proves the controls work and then undoes everything, leaving no trace.</p>
      <p>Run each one the same way, after its migration. A results table appears with mostly <code>true</code> values. Investigate any <code>false</code>.</p>
    </Section>

    <Section id="guide-part-4" eyebrow="Part 4" title="Deploy to Vercel">
      <ol className="guide-steps">
        <li>Go to <code>https://vercel.com</code> and sign in with GitHub.</li>
        <li><strong>Add New → Project</strong>, import your repository.</li>
        <li><strong>Before clicking Deploy</strong>, open <strong>Environment Variables</strong> and add these:</li>
      </ol>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col">Notes</th></tr></thead>
          <tbody>
            <tr><th scope="row"><code>SUPABASE_URL</code></th><td>your Project URL</td><td>from Part 2</td></tr>
            <tr><th scope="row"><code>SUPABASE_PUBLISHABLE_KEY</code></th><td>your publishable/anon key</td><td><strong>not</strong> the service-role key</td></tr>
            <tr><th scope="row"><code>CASTRA_SESSION_SIGNING_KEY</code></th><td>generate one, below</td><td>keep secret</td></tr>
            <tr><th scope="row"><code>CASTRA_HOSTED_STATE_ENABLED</code></th><td><code>true</code></td><td><strong>exactly the lowercase word</strong></td></tr>
            <tr><th scope="row"><code>CASTRA_AUTH_ENABLED</code></th><td><code>true</code></td><td /></tr>
          </tbody>
        </table>
      </Scroll>
      <p>Generate the signing key in Git Bash:</p>
      <Code>{`openssl rand -hex 32`}</Code>
      <Alert title="The single most common misconfiguration">
        <p><code>CASTRA_HOSTED_STATE_ENABLED</code> is compared to the exact string <code>true</code>. <code>True</code>, <code>TRUE</code>, <code>1</code>, and <code>yes</code> all read as false, and the app will silently fall back to the local non-authoritative candidate path.</p>
      </Alert>
      <ol className="guide-steps" start={4}>
        <li>Click <strong>Deploy</strong> and wait for <strong>Ready</strong>.</li>
        <li>Add your domain under <strong>Settings → Domains</strong> if you have one.</li>
      </ol>
    </Section>

    <Section id="guide-part-5" eyebrow="Part 5" title="Create your Commander identity">
      <ol className="guide-steps">
        <li>Open your deployed site.</li>
        <li>Sign up with your email and confirm it.</li>
        <li>Your identity must be recorded as an <strong>active identity profile</strong> with an <strong>assigned Commander authority</strong>. Without both, every state write fails with <code>CASTRA_OPERATIONAL_COMMANDER_REQUIRED</code>.</li>
      </ol>
      <p>The internal identity and authority procedure is not distributed in this preview. <code>DATA-SCOPE.md</code> describes the public boundary; it is not an authentication setup guide.</p>
      <p className="guide-emphasis"><strong>Verify:</strong> sign in and confirm the application loads your workspace rather than an access-denied screen.</p>
    </Section>

    <Section id="guide-part-6" eyebrow="Part 6" title="Initial import">
      <p>The operational state store starts empty. Revision zero is reserved for a one-use, proof-gated initial import. Its internal runbook and server implementation are not distributed in this preview.</p>
      <p>Once complete, the store holds revision 1 or higher, and ordinary governed writes take over.</p>
      <p className="guide-emphasis"><strong>Verify:</strong> the Campaigns page renders your records.</p>
    </Section>

    <Section id="guide-part-7" eyebrow="Part 7" title="Connect the Claude agent">
      <p>This is the part that takes people longest. Follow it exactly.</p>

      <h3>7.1 — Generate the agent token</h3>
      <p>In Git Bash:</p>
      <Code>{`openssl rand -hex 32`}</Code>
      <p>This is your <strong>agent token</strong>. It goes in <strong>two places, with the identical value</strong>:</p>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Where</th><th scope="col">Variable</th><th scope="col">Why</th></tr></thead>
          <tbody>
            <tr><th scope="row">Vercel environment</th><td><code>CASTRA_AGENT_TOKEN_SARGE_CLAUDE</code></td><td>the server validates the presented token</td></tr>
            <tr><th scope="row">Claude environment settings</th><td><code>CASTRA_AGENT_TOKEN_SARGE_CLAUDE</code></td><td>the agent presents it</td></tr>
          </tbody>
        </table>
      </Scroll>
      <p>If they differ, the agent gets <strong>403 <code>AGENT_TOKEN_REJECTED</code></strong>.</p>
      <p>A second token, <code>CASTRA_AGENT_TOKEN_SARGE_CODEX</code>, may be provisioned the same way for a second agent harness. Each harness gets a <strong>distinct</strong> value so reads stay individually attributable.</p>

      <h3>7.2 — Allow the Claude environment to reach your domain</h3>
      <p>A Claude cloud environment uses a network allowlist. Add your production hostname to it, or the agent cannot reach the site at all — it will see a proxy <code>403</code> regardless of credentials.</p>
      <p>If you want the agent to run the repository&rsquo;s tests and builds, also allow <code>registry.npmjs.org</code>.</p>
      <Note>Network policy and environment variables <strong>bind when the session&rsquo;s container starts</strong>. A running session never picks up a settings change. Always open a <strong>fresh session</strong> to test one.</Note>

      <h3>7.3 — Generate the store-read key and its digest</h3>
      <Alert title="Run this block exactly once">
        <p>Every run mints a new key and digest. If you run it twice and mix the outputs, they will not match and the deployment locks itself out silently.</p>
      </Alert>
      <p>In <strong>Git Bash</strong>:</p>
      <Code>{`KAT="$(printf '%s' "castra-agent-store-read-key.v1:KNOWN-ANSWER-TEST" | sha256sum | cut -d' ' -f1)"
if [ "$KAT" != "d988c439e06e33aa581b5a8c6039a8745572cbb71d413ce572f3d7c32717d228" ]; then
  echo "TOOL CHECK : FAILED - stop, do not continue"
else
  echo "TOOL CHECK : OK"
  KEY="$(openssl rand -hex 32)"
  DIGEST="$(printf '%s' "castra-agent-store-read-key.v1:$KEY" | sha256sum | cut -d' ' -f1)"
  ALT="$(printf '%s' "castra-agent-store-read-key.v1:$KEY" | openssl dgst -sha256 -r | cut -d' ' -f1)"
  echo; echo "RAW KEY -> Vercel CASTRA_AGENT_STORE_READ_KEY"; echo "$KEY"
  echo; echo "DIGEST  -> SQL, paste including the sha256: prefix"; echo "sha256:$DIGEST"; echo
  if [ "$ALT" = "$DIGEST" ] && [ "$KEY" != "$DIGEST" ]; then echo "PAIR CHECK : OK"; else echo "PAIR CHECK : FAILED - do not use"; fi
fi`}</Code>
      <p><code>TOOL CHECK : OK</code> proves your hashing tool matches the one inside the database. <code>PAIR CHECK : OK</code> proves the two values you were handed belong together.</p>
      <p className="guide-emphasis"><strong>Copy both outputs immediately.</strong> The key is unrecoverable once the window closes.</p>
      <p>Two traps this block exists to prevent:</p>
      <Alert title="Raw key versus digest — they look identical and are not">
        <ul>
          <li><strong><code>printf '%s'</code>, never <code>echo</code>.</strong> <code>echo</code> appends a newline, the newline is hashed, and you get a valid-looking digest that never matches.</li>
          <li><strong>The two values look alike.</strong> Both are 64 hex characters — a random 32-byte key and a SHA-256 hash are the same length. The digest is the one that comes out of <code>sha256sum</code> and gets the <code>sha256:</code> prefix.</li>
        </ul>
      </Alert>

      <h3>7.4 — Run the agent acceptance artifact, before registering anything</h3>
      <Code>{`cat supabase/acceptance/202608180001_castra_agent_store_read_path_acceptance.sql | clip`}</Code>
      <p>Paste into a <strong>New query</strong> and <strong>Run</strong>. Choose <strong>Run without RLS</strong> if prompted.</p>
      <Alert title="This ordering is a one-way door">
        <p>The acceptance proves the &ldquo;no key registered yet&rdquo; state, so it requires the key table to be <strong>entirely empty</strong>. Key rows are append-only: deletes raise <code>CA007</code>, and revoking leaves the row in place. Once any row exists there is no ordinary route back.</p>
      </Alert>
      <p>Expect 23 boolean columns all <code>true</code>, plus:</p>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Column</th><th scope="col">Expected</th><th scope="col">Meaning</th></tr></thead>
          <tbody>
            <tr><th scope="row"><code>empty_store_case</code></th><td><code>not_applicable_store_already_populated</code></td><td>normal on a populated database</td></tr>
            <tr><th scope="row"><code>two_commander_case</code></th><td><code>not_executed_...</code></td><td>needs a second Commander; honestly recorded, not a pass</td></tr>
          </tbody>
        </table>
      </Scroll>
      <p>If any boolean is <code>false</code>, stop and investigate before registering anything.</p>

      <h3>7.5 — Register the digest</h3>
      <p><strong>New query.</strong> Replace only the middle value, keeping the quotes and comma:</p>
      <Code>{`select castra_operational.register_agent_store_read_key(
  'agent-store-read:primary',
  'sha256:PASTE_YOUR_64_HEX_DIGEST_HERE',
  'v1');`}</Code>
      <p>The quoted digest should be <strong>71 characters</strong>: <code>sha256:</code> plus 64 hex.</p>
      <p><strong>Success:</strong> one row returned.</p>
      <p>The helper resolves your Commander identity itself and binds the key to it, so the key authorises reading <strong>one specific Commander&rsquo;s</strong> state. That binding is re-verified on every read.</p>

      <h3>7.6 — Place the raw key and redeploy</h3>
      <ol className="guide-steps">
        <li>Vercel → your project → <strong>Settings → Environment Variables → Add New</strong>
          <ul>
            <li>Name: <code>CASTRA_AGENT_STORE_READ_KEY</code></li>
            <li>Value: your <strong>RAW KEY</strong> — 64 hex, <strong>no</strong> <code>sha256:</code> prefix</li>
            <li>Environments: <strong>Production</strong></li>
            <li>Enable <strong>Sensitive</strong> if offered</li>
          </ul>
        </li>
        <li><strong>Deployments → most recent Production → ⋯ → Redeploy</strong></li>
        <li>Wait for <strong>Ready</strong></li>
      </ol>
      <Alert title="Which value goes where">
        <Scroll>
          <table className="guide-table guide-table-compare">
            <thead><tr><th scope="col"><span className="visually-hidden">Property</span></th><th scope="col">SQL (step 7.5)</th><th scope="col">Vercel (step 7.6)</th></tr></thead>
            <tbody>
              <tr><th scope="row">Which value</th><td>DIGEST</td><td>RAW KEY</td></tr>
              <tr><th scope="row">Prefix</th><td><code>sha256:</code></td><td>none</td></tr>
              <tr><th scope="row">Length</th><td>71</td><td>64</td></tr>
            </tbody>
          </table>
        </Scroll>
      </Alert>

      <h3>7.7 — Verify the live read</h3>
      <p>From a <strong>fresh</strong> Claude session with the token in its environment:</p>
      <Code>{`curl -sS -H "authorization: Bearer $CASTRA_AGENT_TOKEN_SARGE_CLAUDE" \\
  https://<your-domain>/api/agent-state`}</Code>
      <p><strong>Success:</strong> HTTP 200 with <code>&quot;reasonCode&quot;:&quot;STATE_LOADED&quot;</code>, plus your status rollup, Open Work Index, and server-computed next Action numbers.</p>
    </Section>

    <Section id="guide-part-8" eyebrow="Part 8" title="Final verification checklist">
      <ul className="guide-checklist">
        <li>Six migrations applied, each reporting success</li>
        <li>Acceptance artifacts run, booleans all <code>true</code></li>
        <li>Site loads and you can sign in as Commander</li>
        <li>Campaigns page renders your records</li>
        <li><code>CASTRA_HOSTED_STATE_ENABLED</code> is exactly <code>true</code></li>
        <li>Agent token identical in Vercel and the Claude environment</li>
        <li>Your domain is on the Claude environment&rsquo;s network allowlist</li>
        <li>Acceptance ran <strong>before</strong> the key was registered</li>
        <li>Raw key in Vercel, digest in the database — not swapped</li>
        <li>Redeployed after adding the key</li>
        <li><code>/api/agent-state</code> returns 200 <code>STATE_LOADED</code></li>
      </ul>
    </Section>

    <Section id="guide-part-9" eyebrow="Part 9" title="Troubleshooting">
      <p>Every entry here happened during a real deployment.</p>

      <h3>Shell and files</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Symptom</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
          <tbody>
            <tr><th scope="row"><code>'export' is not recognized...</code></th><td>Command Prompt, not Git Bash</td><td>open Git Bash</td></tr>
            <tr><th scope="row"><code>The system cannot find the file specified</code></th><td>repository not updated</td><td><code>git pull origin main</code></td></tr>
            <tr><th scope="row"><code>clip</code> produced nothing visible</th><td>it succeeded silently</td><td>just paste; <code>clip</code> never prints</td></tr>
            <tr><th scope="row">Pasted SQL fails near the end</th><td>truncated paste</td><td>re-copy; confirm the last line</td></tr>
          </tbody>
        </table>
      </Scroll>

      <h3>Key and digest</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Symptom</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
          <tbody>
            <tr><th scope="row">Verification produced a <em>new</em> value</th><td>the generator block ran twice</td><td>re-run once, take both outputs from that run</td></tr>
            <tr><th scope="row"><code>..._DIGEST_MALFORMED</code> (<code>CA010</code>)</th><td>wrong shape</td><td>needs <code>sha256:</code> + exactly 64 lowercase hex</td></tr>
            <tr><th scope="row">Read returns <code>CA001</code> key rejected</th><td>key and digest are not a pair</td><td>register the correct digest under a <strong>new</strong> label</td></tr>
            <tr><th scope="row">Two 64-hex values, unsure which</th><td>—</td><td>digest comes from <code>sha256sum</code>; raw key from <code>openssl rand</code></td></tr>
          </tbody>
        </table>
      </Scroll>
      <Alert title="A prefixed raw key passes the shape check and still never matches">
        <p>A hex-shaped raw key with a <code>sha256:</code> prefix manually added will pass the registration shape check. It then never matches, and your raw key is sitting in the database. If you suspect this, roll back, re-apply, re-run acceptance, and register a freshly generated pair.</p>
      </Alert>

      <h3>The agent read</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Response</th><th scope="col">Meaning</th><th scope="col">Fix</th></tr></thead>
          <tbody>
            <tr><th scope="row">proxy <code>403</code>, never reaches the site</th><td>domain not allowlisted</td><td>add it; open a <strong>fresh</strong> session</td></tr>
            <tr><th scope="row"><code>401 AGENT_AUTHENTICATION_REQUIRED</code></th><td>no token presented</td><td>check the Claude environment variable</td></tr>
            <tr><th scope="row"><code>403 AGENT_TOKEN_REJECTED</code></th><td>tokens differ</td><td>make Vercel and Claude values identical</td></tr>
            <tr><th scope="row"><code>503 HOSTED_STATE_NOT_ACTIVATED</code></th><td><code>CASTRA_HOSTED_STATE_ENABLED</code> not exactly <code>true</code></td><td>fix and redeploy</td></tr>
            <tr><th scope="row"><code>503 AGENT_STORE_READ_KEY_NOT_CONFIGURED</code></th><td>key missing from Vercel, or no redeploy</td><td>add it, then <strong>redeploy</strong></td></tr>
            <tr><th scope="row"><code>503 AGENT_STORE_READ_KEY_NOT_PROVISIONED</code> (<code>CA005</code>)</th><td>migration applied, no key registered</td><td>run step 7.5</td></tr>
            <tr><th scope="row"><code>503 AGENT_STORE_READ_FUNCTION_MISSING</code></th><td>migration 6 not applied</td><td>apply it</td></tr>
            <tr><th scope="row"><code>503 AGENT_STORE_READ_GRANT_MISSING</code></th><td>grants altered</td><td>re-apply migration 6</td></tr>
            <tr><th scope="row"><code>503 ..._KEY_BINDING_INACTIVE</code> (<code>CA006</code>)</th><td>Commander binding changed</td><td>re-register under a new label</td></tr>
            <tr><th scope="row"><code>503 STORE_READ_DENIED</code> + <code>AUTHENTICATION_REQUIRED</code></th><td>server cannot authenticate to the store</td><td>migration 6 missing or key not placed</td></tr>
          </tbody>
        </table>
      </Scroll>

      <h3>Recovery: key registered before acceptance ran</h3>
      <p>The acceptance aborts with <code>CASTRA_AGENT_READ_ACCEPTANCE_REQUIRES_UNPROVISIONED_KEY_TABLE</code>. It damages nothing. To recover:</p>
      <ol className="guide-steps">
        <li>Apply <code>supabase/rollback/202608180001_castra_agent_store_read_path_down.sql</code></li>
        <li>Re-apply migration 6</li>
        <li>Run the acceptance artifact — the key table is empty again</li>
        <li>Register the digest, <strong>this time last</strong></li>
      </ol>
      <p>Your raw key is unchanged, so the Vercel variable does not need replacing. This round trip has been executed end to end; the state ledger and Commander grant both survive.</p>

      <h3>Toolchain</h3>
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Symptom</th><th scope="col">Cause</th><th scope="col">Fix</th></tr></thead>
          <tbody>
            <tr><th scope="row"><code>npm ci</code> fails <code>E403</code></th><td>registry not allowlisted</td><td>add <code>registry.npmjs.org</code>; <strong>fresh</strong> session</td></tr>
            <tr><th scope="row"><code>npx tsc --version</code> works but builds fail</th><td>resolves to a global TypeScript, not the pinned one</td><td>use <code>node_modules/.bin/</code>; <code>npm ci</code> is the only honest check</td></tr>
          </tbody>
        </table>
      </Scroll>
    </Section>

    <Section id="guide-part-10" eyebrow="Part 10" title="What never to do">
      <ul className="guide-never">
        <li><strong>Never paste a raw key, digest, token, or password into a chat, a repository file, a receipt, or a commit.</strong> Agents never need them.</li>
        <li><strong>Never use the Supabase service-role key.</strong> CASTRA refuses it.</li>
        <li><strong>Never skip the acceptance artifact</strong> to save time. It is the only moment it can run.</li>
        <li><strong>Never choose &ldquo;Run and enable RLS&rdquo;</strong> on a verified artifact.</li>
        <li><strong>Never assume an environment variable took effect</strong> without a redeploy and a check.</li>
        <li><strong>Never derive an Action number from repository text</strong> when the authoritative store is reachable. Ask, or read it from the store.</li>
      </ul>
    </Section>

    <Section id="guide-next" eyebrow="Continue" title="Where to go next">
      <Scroll>
        <table className="guide-table">
          <thead><tr><th scope="col">Topic</th><th scope="col">Document</th></tr></thead>
          <tbody>
            <tr><th scope="row">Governance, roles, verification ladder</th><td>Internal guide not distributed in this preview.</td></tr>
            <tr><th scope="row">Authority cutover contract</th><td><code>DATA-SCOPE.md#withheld-internal-reference</code></td></tr>
            <tr><th scope="row">Lifecycle commands</th><td><code>DATA-SCOPE.md#withheld-internal-reference</code></td></tr>
            <tr><th scope="row">Deployment capability</th><td><code>DATA-SCOPE.md#withheld-internal-reference</code></td></tr>
            <tr><th scope="row">Provider-side detail</th><td>Provider setup is not distributed in this preview.</td></tr>
            <tr><th scope="row">Operational state</th><td><code>DATA-SCOPE.md#withheld-internal-reference</code></td></tr>
            <tr><th scope="row">Backup and restore</th><td><code>DATA-SCOPE.md#withheld-internal-reference</code></td></tr>
          </tbody>
        </table>
      </Scroll>
    </Section>

    <p className="guide-footnote">This preview retains a deployment-reading surface, not a complete setup or deployment capability. Internal procedures, operational evidence and provider configuration are not distributed; <code>DATA-SCOPE.md</code> explains that boundary. This screen performs no provider action, holds no credentials, and changes no operational state. Never paste a key, digest, token, or password into CASTRA, a chat, a repository file, a receipt, or a commit.</p>
  </>;
}
