/**
 * Mockup Sandbox Application
 *
 * A component preview server for the design system. Routes:
 * - `/preview/<ComponentPath>` — renders a specific component in isolation
 * - `/` — shows a gallery/landing page with usage instructions
 *
 * Components are auto-discovered from `src/components/mockups/` by the
 * `mockupPreviewPlugin` Vite plugin and made available as lazy imports.
 */
import { useEffect, useState, type ComponentType } from "react";
import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

/* -------------------------------------------------------------------------- */
/*  Component Resolution                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a React component from a dynamically imported module.
 *
 * Tries these exports in order:
 * 1. `default` export
 * 2. Named `Preview` export
 * 3. Export matching the component file name
 * 4. Last function export (fallback)
 */
function resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];

  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

/* -------------------------------------------------------------------------- */
/*  Preview Renderer                                                           */
/* -------------------------------------------------------------------------- */

interface PreviewRendererProps {
  componentPath: string;
  modules: ModuleMap;
}

/**
 * Dynamically loads and renders a single mockup component.
 * Shows an error message if the component can't be found or loaded.
 */
function PreviewRenderer({ componentPath, modules }: PreviewRendererProps) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];

      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) return;

        const name = componentPath.split("/").pop()!;
        const comp = resolveComponent(mod, name);

        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\n` +
              "Make sure the file has at least one exported function component.",
          );
          return;
        }

        setComponent(() => comp);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre style={{ color: "red", padding: "2rem", fontFamily: "system-ui" }}>
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

/* -------------------------------------------------------------------------- */
/*  Gallery (Landing Page)                                                     */
/* -------------------------------------------------------------------------- */

/** Landing page shown at the root URL with usage instructions. */
function Gallery() {
  const examplePath = `${getBasePath()}/preview/ComponentName`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold text-gray-900 mb-3">
          Component Preview Server
        </h1>
        <p className="text-gray-500 mb-4">
          This server renders individual components for the workspace canvas.
        </p>
        <p className="text-sm text-gray-400">
          Access component previews at{" "}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
            {examplePath}
          </code>
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Routing Helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Get the base path from Vite's BASE_URL, stripping trailing slashes. */
function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

/**
 * Extract the component path from the current URL.
 * Returns `null` if the URL doesn't match the `/preview/<path>` pattern.
 */
function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;

  // Strip the base path prefix to get the local route
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;

  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

/* -------------------------------------------------------------------------- */
/*  App                                                                        */
/* -------------------------------------------------------------------------- */

function App() {
  const previewPath = getPreviewPath();

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  return <Gallery />;
}

export default App;
