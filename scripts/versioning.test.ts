import { describe, expect, it } from 'vitest';

import {
    formatArtifactVersion,
    formatExtensionVersion,
    formatReleaseTag,
    formatReleaseTitle,
    formatManifestVersion,
} from './versioning';

describe('versioning helpers', () => {
    it('keeps release identity as semantic version only', () => {
        expect(formatReleaseTag('1.20.0')).toBe('v1.20.0');
        expect(formatReleaseTitle('1.20.0')).toBe('Release 1.20.0');
    });

    it('formats release tag from semantic version', () => {
        expect(formatReleaseTag('1.20.0')).toBe('v1.20.0');
    });

    it('formats extension, manifest, and artifact identity with build as the fourth segment', () => {
        const versionParts = { version: '1.20.0', build: 196 };
        expect(formatExtensionVersion(versionParts)).toBe('1.20.0.196');
        expect(formatManifestVersion(versionParts)).toBe('1.20.0.196');
        expect(formatArtifactVersion(versionParts)).toBe('1.20.0.196');
    });

    it('uses the base version when build number is missing', () => {
        expect(formatArtifactVersion({ version: '1.20.0' })).toBe('1.20.0');
    });
});
