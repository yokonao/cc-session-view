// Present only when more than one config dir is served, so single-dir pages
// render exactly as before.
export interface ConfigView {
	names: string[];
	current: string;
}

export function withConfig(
	path: string,
	config: ConfigView | undefined,
	name = config?.current,
): string {
	if (!config || name === undefined) return path;
	const url = new URL(path, "http://x");
	url.searchParams.set("config", name);
	return `${url.pathname}${url.search}`;
}

export function ConfigTabs(props: { config?: ConfigView; path: string }) {
	const { config, path } = props;
	if (!config) return null;
	return (
		<nav class="config-tabs" aria-label="Claude config directory">
			{config.names.map((name) => (
				<a
					class={name === config.current ? "config-tab active" : "config-tab"}
					href={withConfig(path, config, name)}
					aria-current={name === config.current ? "page" : undefined}
				>
					{name}
				</a>
			))}
		</nav>
	);
}
