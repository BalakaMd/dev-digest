import { describe, it, expect } from 'vitest';
import { parsePrRef, parseRepoRef } from '../src/resolve/identifiers.js';

describe('parsePrRef', () => {
  it('parses owner/repo#N', () => {
    expect(parsePrRef('acme/payments-api#482')).toEqual({
      kind: 'owner-repo-number',
      owner: 'acme',
      name: 'payments-api',
      number: 482,
    });
  });

  it('parses a GitHub PR URL, ignoring a trailing path', () => {
    expect(parsePrRef('https://github.com/acme/payments-api/pull/482/files')).toEqual({
      kind: 'owner-repo-number',
      owner: 'acme',
      name: 'payments-api',
      number: 482,
    });
  });

  it('parses a bare number or #number', () => {
    expect(parsePrRef('482')).toEqual({ kind: 'bare-number', number: 482 });
    expect(parsePrRef('#482')).toEqual({ kind: 'bare-number', number: 482 });
  });

  it('parses a uuid as a pass-through', () => {
    expect(parsePrRef('123e4567-e89b-12d3-a456-426614174000')).toEqual({
      kind: 'uuid',
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('returns null for garbage input', () => {
    expect(parsePrRef('not a pr')).toBeNull();
  });
});

describe('parseRepoRef', () => {
  it('parses owner/repo', () => {
    expect(parseRepoRef('acme/payments-api')).toEqual({ kind: 'owner-name', owner: 'acme', name: 'payments-api' });
  });

  it('parses a GitHub repo URL', () => {
    expect(parseRepoRef('https://github.com/acme/payments-api')).toEqual({
      kind: 'owner-name',
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('parses a bare repo name', () => {
    expect(parseRepoRef('payments-api')).toEqual({ kind: 'bare-name', name: 'payments-api' });
  });
});
