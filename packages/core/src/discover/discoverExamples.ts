/**
 * Worked examples for the Discover agent command.
 *
 * Shape and density a reviewer can scan in seconds — the dual-subtitle sample
 * from the pipeline guide, written in the Markdown contract `mdParse.ts` reads.
 * The product in the example is not the user's product; the headings and
 * density are what to copy.
 */

import type { DiscoverStepId } from '../contracts/discover';

export const DISCOVER_WORKED_EXAMPLES: Record<DiscoverStepId, string> = {
  idea: `# Idea

## Original sentence

App xem video hỗ trợ 2 subtitle cùng lúc.

## Problem

Người học ngoại ngữ không so được hai bản dịch khi xem phim.

## Users

- **U-01** — Người học ngoại ngữ qua phim.

## Core value

Hai subtitle song song, không phải tua đi tua lại.

## Minimum MVP

Mở video local + nạp 2 file .srt.
`,

  product: `# Product

## Problem

Không so được hai bản dịch subtitle khi xem video local.

## Target users

- **TU-01** — Người học ngoại ngữ qua phim.

## Core value

Hai subtitle hiển thị đồng thời, chỉnh offset từng cái.

## Platforms

- **PLAT-01** — iOS (iPhone + iPad).

## MVP scope

- **MVP-01** — Mở video local.
- **MVP-02** — Nạp hai file subtitle.
- **MVP-03** — Phát, pause, seek.
- **MVP-04** — Offset từng subtitle.

## Out of scope

- **OOS-01** — Streaming / URL.
- **OOS-02** — Tài khoản và cloud sync.

## Future features

- **FUT-01** — Dictionary tap-to-translate.
`,

  requirements: `# Requirements

## Functional requirements

- **FR-01** — User có thể mở video local.
  Chọn file từ Files; player nạp và hiện khung đầu. Không hỗ trợ URL hay stream.
- **FR-02** — User có thể nạp subtitle #1.
  Một file .srt gắn vào track overlay thứ nhất.
- **FR-03** — User có thể nạp subtitle #2.
  Track thứ hai độc lập với track một — cùng file hoặc file khác.
- **FR-04** — Hai subtitle hiển thị đồng thời.
  Cả hai overlay bám timeline; không che lẫn nhau.
- **FR-05** — Mỗi subtitle chỉnh được timing offset.
  Offset từng track, không dùng một offset chung.

## Non-functional requirements

- **NFR-PERF-01** — Seek dưới 200ms trên file 2GB.
  Kéo thanh tiến trình phải nhảy khung ngay, không chờ buffer.
- **NFR-OFFLINE-01** — Chạy hoàn toàn offline.
- **NFR-A11Y-01** — Cỡ chữ subtitle tối thiểu 16pt.
`,

  features: `# Feature breakdown

## Feature tree

\`\`\`text
Video
├── Open video
├── Play/Pause
├── Seek
└── Playback speed

Subtitle
├── Load subtitle
├── Parse SRT
├── Sync
├── Offset
└── Style

Settings
├── Font size
├── Font color
└── Background
\`\`\`

## Features

- **F-VIDEO-01** — Mở, phát, pause, seek, tốc độ — FR-01.
  Playback cơ bản trên file local: mở từ Files, play/pause, seek, đổi tốc độ.
- **F-SUB-01** — Nạp hai SRT và hiện cùng lúc — FR-02, FR-03, FR-04.
  Hai overlay độc lập, cùng timeline, không đè chữ.
- **F-SUB-02** — Offset từng subtitle — FR-05.
  Chỉnh lệch thời gian riêng cho từng track.
- **F-SET-01** — Cỡ chữ, màu, nền.
  Style subtitle áp dụng chung, lưu local.
`,

  usecases: `# Use cases

## Use cases

### UC-01 — Open video

- **Actor:** người dùng cuối
- **Trigger:** bấm "Mở video" — FR-01
- **Main flow:**
  - Chọn file từ Files
  - Player nạp và hiện khung đầu

### UC-02 — Load subtitle

- **Actor:** người dùng cuối
- **Trigger:** bấm "Nạp subtitle" — FR-02, FR-03
- **Main flow:**
  - Chọn file .srt
  - Parser đọc cue
  - Overlay gắn vào player

### UC-03 — Play video

- **Actor:** người dùng cuối
- **Trigger:** bấm Play — F-VIDEO-01
- **Main flow:**
  - Video chạy
  - Hai overlay subtitle cập nhật theo timeline
`,

  userflows: `# User flow / Screen flow

## Screen flow

\`\`\`mermaid
flowchart TD
    Launch([Launch]) --> Home
    Home --> SelectVideo[Select Video]
    SelectVideo --> Player
    Player --> Subtitle1[Subtitle 1]
    Player --> Subtitle2[Subtitle 2]
    Player --> Settings
\`\`\`

## Screens

- **SCR-01** — Home
- **SCR-02** — Select Video
- **SCR-03** — Player
- **SCR-04** — Settings

## Flows

### FLOW-01 — Play with two subtitles

- **Use cases:** UC-01, UC-02, UC-03
- **Steps:**
  - Launch → Home
  - Select Video → Player
  - Nạp subtitle 1 và 2 trên Player
`,

  architecture: `# Architecture

## Layering

\`\`\`text
Presentation
     ↓
Domain
     ↓
Data
     ↓
Infrastructure
\`\`\`

## Layers

- **L-01** — Presentation
- **L-02** — Domain
- **L-03** — Data
- **L-04** — Infrastructure

## Patterns

- **PAT-01** — MVVM
- **PAT-02** — Clean Architecture
- **PAT-03** — DI
- **PAT-04** — Repository

## Rationale

Use case là phát local + overlay — bốn tầng, không có service phân tán.
`,

  datamodel: `# Data / API / Storage

## Overview

\`\`\`text
Data
├── Entities / Models
├── Repository interfaces
├── API
└── Storage
    ├── Local database
    ├── Cache
    ├── File storage
    └── Secrets / preferences
\`\`\`

## Entities

- **E-01** — Video — file local đang phát.
- **E-02** — Subtitle — một track overlay.
- **E-03** — PlaybackState — play/pause, vị trí, tốc độ.

## Repositories

- **REPO-01** — Video — mở file local.
- **REPO-02** — Subtitle — parse SRT.

## API endpoints

- **API-01** — (không có — app offline.)

## Storage

File trên disk + SwiftData cho style/offset. Không có mạng.
`,

  techdecisions: `# Technical decisions

## Stack

### TECH-01 — Language

- **Choice:** Swift
- **Why:** Nền tảng iOS, AVPlayer và SwiftUI cùng ngôn ngữ.

### TECH-02 — UI

- **Choice:** SwiftUI
- **Why:** Overlay subtitle là view layer, ít boilerplate hơn UIKit.

### TECH-03 — Video

- **Choice:** AVPlayer
- **Why:** Có sẵn trong SDK, seek chính xác.

### TECH-04 — Persistence

- **Choice:** SwiftData
- **Why:** Style và offset là dữ liệu nhỏ, local.

## Open questions

- **TQ-01** — Có cần parser ASS ngoài SRT cho MVP không?
`,

  structure: `# Project structure

## Folder tree

\`\`\`text
App/
├── Application/
├── Core/
│   ├── Domain/
│   ├── Data/
│   └── Infrastructure/
├── Features/
│   ├── Home/
│   ├── Player/
│   ├── Subtitle/
│   └── Settings/
├── Shared/
└── Resources/
\`\`\`

## Naming conventions

- **NC-01** — Feature folder = screen name.
- **NC-02** — Repository protocol trong Domain, impl trong Data.

## Module mapping

- **MAP-01** — M-01 → App/Features/Home
- **MAP-02** — M-02 → App/Features/Player
- **MAP-03** — M-03 → App/Core/Domain
`,

  plan: `# Implementation plan

## Phases

### PH-01 — Project skeleton

- **Goal:** Dựng khung project và DI.
- **Deliverables:**
  - Cây thư mục theo PROJECT_STRUCTURE.md
  - DI container rỗng
- **Definition of done:**
  - App build được, màn hình trắng

### PH-02 — Core models

- **Goal:** Entity Video, Subtitle, SubtitleCue, PlaybackState.
- **Depends on:**
  - PH-01
- **Deliverables:**
  - E-01 … E-04 trong Domain

### PH-03 — Video playback

- **Goal:** Mở và phát video local — FR-01, F-VIDEO-01.
- **Depends on:**
  - PH-02
- **Deliverables:**
  - Player + seek + speed

### PH-04 — Dual subtitle

- **Goal:** Hai overlay SRT đồng thời — FR-02, FR-03, FR-04, F-SUB-01.
- **Depends on:**
  - PH-03
- **Deliverables:**
  - Parser SRT + hai overlay + offset FR-05
`,

  skeleton: `# Generate skeleton

## Skeleton tree

\`\`\`text
project
├── source folders
├── modules
├── protocols/interfaces
├── base models
├── DI container
├── navigation
├── config
├── tests
└── README
\`\`\`

## Files and folders

- **SK-01** — App/Application/App.swift
- **SK-02** — App/Core/Domain/
- **SK-03** — App/Core/Data/
- **SK-04** — App/Features/Home/
- **SK-05** — App/Features/Player/

## Interfaces

- **IF-01** — VideoRepository
- **IF-02** — SubtitleRepository

## Config

- **CFG-01** — DI container đăng ký repository.

## Tests

- **TST-01** — SubtitleParserTests
`,
};

/** Short ADR example that belongs next to the Technical Decisions step. */
export const DISCOVER_ADR_EXAMPLE = `# ADR-001 — SwiftUI over UIKit

## Context

Player cần overlay hai subtitle; UIKit đòi thêm view hierarchy.

## Decision

SwiftUI cho mọi màn hình.

## Consequences

Preview nhanh. AVPlayer bọc qua UIViewRepresentable.
`;

export const DISCOVER_MODULES_EXAMPLE = `# Modules

## Modules

### M-01 — Home

- **Responsibility:** Chọn video để mở.
- **Folder:** App/Features/Home

### M-02 — Player

- **Responsibility:** Phát video + hai overlay subtitle.
- **Depends on:**
  - M-03
- **Folder:** App/Features/Player

### M-03 — SubtitleKit

- **Responsibility:** Parse SRT và sync theo timeline.
- **Folder:** App/Core/Domain
`;

export const DISCOVER_DATA_FLOW_EXAMPLE = `# Data flow

## Data flow

\`\`\`text
Files → VideoRepository → Player
Files → SubtitleRepository → Overlay
PlaybackState → SwiftData (offset, style)
\`\`\`
`;
