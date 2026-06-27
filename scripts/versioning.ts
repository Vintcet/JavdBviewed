export interface VersionParts {
    version: string;
    build?: number | string | null;
}

export function normalizeBuildNumber(build: number | string | null | undefined): number | null {
    if (build === null || build === undefined || build === '') return null;
    const buildNumber = Number(build);
    return Number.isInteger(buildNumber) && buildNumber >= 0 ? buildNumber : null;
}

export function formatExtensionVersion(versionParts: VersionParts): string {
    const buildNumber = normalizeBuildNumber(versionParts.build);
    return buildNumber === null
        ? versionParts.version
        : `${versionParts.version}.${buildNumber}`;
}

export function formatManifestVersion(versionParts: VersionParts): string {
    return formatExtensionVersion(versionParts);
}

export function formatArtifactVersion(versionParts: VersionParts): string {
    return formatExtensionVersion(versionParts);
}

export function formatReleaseTag(version: string): string {
    return `v${version}`;
}

export function formatReleaseTitle(version: string): string {
    return `Release ${version}`;
}
