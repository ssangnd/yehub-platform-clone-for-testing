import { BadRequestException } from '@nestjs/common';
import { Platform } from '../../generated/prisma/client';
import {
  validateUsername,
  USERNAME_PATTERNS,
} from './social-account.validator';

describe('validateUsername', () => {
  it('accepts a valid Facebook username', () => {
    expect(() => validateUsername(Platform.FACEBOOK, 'john.doe')).not.toThrow();
  });

  it('accepts a valid Instagram username', () => {
    expect(() =>
      validateUsername(Platform.INSTAGRAM, 'john_doe.99'),
    ).not.toThrow();
  });

  it('accepts a valid TikTok username', () => {
    expect(() => validateUsername(Platform.TIKTOK, 'john.doe')).not.toThrow();
  });

  it('accepts a valid YouTube handle', () => {
    expect(() =>
      validateUsername(Platform.YOUTUBE, 'JohnDoe-Channel_99'),
    ).not.toThrow();
  });

  it('accepts a valid Threads username', () => {
    expect(() =>
      validateUsername(Platform.THREADS, 'john.doe_99'),
    ).not.toThrow();
  });

  it('throws BadRequestException for empty username', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, '')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for username with spaces', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'john doe')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for username with invalid chars', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'john@doe!')).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for Facebook username shorter than 3 chars', () => {
    expect(() => validateUsername(Platform.FACEBOOK, 'jo')).toThrow(
      BadRequestException,
    );
  });

  it('error message includes platform and username', () => {
    expect(() => validateUsername(Platform.INSTAGRAM, 'bad name')).toThrow(
      'Invalid INSTAGRAM username: bad name',
    );
  });

  it('exports a USERNAME_PATTERNS map keyed by Platform', () => {
    expect(USERNAME_PATTERNS[Platform.FACEBOOK]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.INSTAGRAM]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.TIKTOK]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.YOUTUBE]).toBeInstanceOf(RegExp);
    expect(USERNAME_PATTERNS[Platform.THREADS]).toBeInstanceOf(RegExp);
  });
});
