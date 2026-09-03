/* Discover fixture for the harness — a real `buildDiscoverUi()` payload
 * captured from a temporary workspace, so the tab is developed against the
 * exact shape the extension sends rather than a hand-written approximation.
 * Regenerate by driving DiscoverService and dumping buildDiscoverUi().
 */

import type { WorkspaceState } from '../src/webview/lib/types';

export const DISCOVER_FIXTURE: NonNullable<WorkspaceState['discover']> = {
  "id": "DISC-001",
  "title": "App xem video hỗ trợ 2 subtitle cùng lúc.",
  "seedSentence": "App xem video hỗ trợ 2 subtitle cùng lúc.",
  "docsRoot": "docs",
  "docsRootPath": "/Users/you/project/docs",
  "outputLanguage": "vi",
  "currentStep": "requirements",
  "revision": 13,
  "steps": [
    {
      "id": "idea",
      "order": 1,
      "label": "Idea",
      "goal": "Pin down the problem, who has it, the core value, and the smallest MVP.",
      "files": [
        "product/IDEA.md"
      ],
      "hasContent": true
    },
    {
      "id": "product",
      "order": 2,
      "label": "Product Definition",
      "goal": "Turn the idea into a product definition: problem, users, value, platforms, MVP scope, non-goals.",
      "files": [
        "product/PRODUCT.md"
      ],
      "hasContent": true
    },
    {
      "id": "requirements",
      "order": 3,
      "label": "Requirements",
      "goal": "State verifiable functional requirements plus the non-functional ones that constrain them.",
      "files": [
        "product/REQUIREMENTS.md"
      ],
      "hasContent": true
    },
    {
      "id": "features",
      "order": 4,
      "label": "Feature Breakdown",
      "goal": "Break the requirements into feature groups; every requirement must land in one.",
      "files": [
        "product/FEATURES.md"
      ],
      "hasContent": false
    },
    {
      "id": "usecases",
      "order": 5,
      "label": "Use Cases",
      "goal": "Turn each important feature into system behaviour: actor, trigger, main flow.",
      "files": [
        "product/USE_CASES.md"
      ],
      "hasContent": true
    },
    {
      "id": "userflows",
      "order": 6,
      "label": "User Flow / Screen Flow",
      "goal": "Lay out the screens and the paths a user takes through them.",
      "files": [
        "product/USER_FLOWS.md"
      ],
      "hasContent": false
    },
    {
      "id": "architecture",
      "order": 7,
      "label": "Architecture",
      "goal": "Choose the layering and modules the use cases actually need — never the other way round.",
      "files": [
        "architecture/ARCHITECTURE.md",
        "architecture/MODULES.md",
        "architecture/DATA_FLOW.md"
      ],
      "hasContent": false
    },
    {
      "id": "datamodel",
      "order": 8,
      "label": "Data / API / Storage",
      "goal": "Sketch the data layer as a general structure — entities, repositories, API and storage — without listing fields or every endpoint.",
      "files": [
        "architecture/DATA_MODEL.md"
      ],
      "hasContent": false
    },
    {
      "id": "techdecisions",
      "order": 9,
      "label": "Technical Decisions",
      "goal": "Record the stack and — the part that matters — why each piece was chosen.",
      "files": [
        "architecture/TECH_STACK.md"
      ],
      "hasContent": false
    },
    {
      "id": "structure",
      "order": 10,
      "label": "Project Structure",
      "goal": "Design the folder tree the modules map onto — after the modules exist, not before.",
      "files": [
        "architecture/PROJECT_STRUCTURE.md"
      ],
      "hasContent": false
    },
    {
      "id": "plan",
      "order": 11,
      "label": "Implementation Plan",
      "goal": "Slice the build into phases in dependency order — never hand the whole project over at once.",
      "files": [
        "plans/IMPLEMENTATION_PLAN.md"
      ],
      "hasContent": true
    },
    {
      "id": "skeleton",
      "order": 12,
      "label": "Generate Skeleton",
      "goal": "List the real files, interfaces, config and tests phase 1 has to create.",
      "files": [
        "plans/SKELETON.md"
      ],
      "hasContent": false
    }
  ],
  "docs": [
    {
      "path": "product/IDEA.md",
      "title": "Idea",
      "exists": true,
      "filePath": "/Users/you/project/docs/product/IDEA.md",
      "step": "idea",
      "raw": "# Idea\n\n## Original sentence\n\nApp xem video hỗ trợ 2 subtitle cùng lúc.\n\n## Problem\n\nNgười học ngoại ngữ phải tua đi tua lại để so hai bản dịch.\n\n## Users\n\n- **U-01** — Người học ngoại ngữ qua phim.\n\n## Core value\n\nHai subtitle song song, chỉnh lệch thời gian riêng từng bản.\n\n## Minimum MVP\n\nMở video local + nạp 2 file .srt + chỉnh offset.\n",
      "updatedAt": "2026-09-01T16:00:42.499Z",
      "sections": [
        {
          "key": "seed",
          "heading": "Original sentence",
          "kind": "prose",
          "prose": "App xem video hỗ trợ 2 subtitle cùng lúc.",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "problem",
          "heading": "Problem",
          "kind": "prose",
          "prose": "Người học ngoại ngữ phải tua đi tua lại để so hai bản dịch.",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "users",
          "heading": "Users",
          "kind": "items",
          "idPrefix": "U",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "U-01",
              "text": "Người học ngoại ngữ qua phim.",
              "origin": "human",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "value",
          "heading": "Core value",
          "kind": "prose",
          "prose": "Hai subtitle song song, chỉnh lệch thời gian riêng từng bản.",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "mvp",
          "heading": "Minimum MVP",
          "kind": "prose",
          "prose": "Mở video local + nạp 2 file .srt + chỉnh offset.",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "product/PRODUCT.md",
      "title": "Product",
      "exists": true,
      "filePath": "/Users/you/project/docs/product/PRODUCT.md",
      "step": "product",
      "raw": "# Product\n\n## Problem\n\nKhông app phổ thông nào cho xem hai phụ đề cùng lúc.\n\n## Target users\n\n- **TU-01** — Người học tiếng Anh trình độ trung cấp.\n\n## Core value\n\nSo sánh trực tiếp bản gốc và bản dịch trong lúc xem.\n\n## Platforms\n\n- **PLAT-01** — iOS 17+\n\n## MVP scope\n\n- **MVP-01** — Phát video local với hai subtitle.\n\n## Out of scope\n\n- **OOS-01** — Tải subtitle từ internet.\n\n## Future features\n",
      "updatedAt": "2026-09-01T16:00:42.505Z",
      "sections": [
        {
          "key": "problem",
          "heading": "Problem",
          "kind": "prose",
          "prose": "Không app phổ thông nào cho xem hai phụ đề cùng lúc.",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "targetUsers",
          "heading": "Target users",
          "kind": "items",
          "idPrefix": "TU",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "TU-01",
              "text": "Người học tiếng Anh trình độ trung cấp.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "value",
          "heading": "Core value",
          "kind": "prose",
          "prose": "So sánh trực tiếp bản gốc và bản dịch trong lúc xem.",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "platforms",
          "heading": "Platforms",
          "kind": "items",
          "idPrefix": "PLAT",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "PLAT-01",
              "text": "iOS 17+",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "mvpScope",
          "heading": "MVP scope",
          "kind": "items",
          "idPrefix": "MVP",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "MVP-01",
              "text": "Phát video local với hai subtitle.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "outOfScope",
          "heading": "Out of scope",
          "kind": "items",
          "idPrefix": "OOS",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "OOS-01",
              "text": "Tải subtitle từ internet.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "future",
          "heading": "Future features",
          "kind": "items",
          "idPrefix": "FUT",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "product/REQUIREMENTS.md",
      "title": "Requirements",
      "exists": true,
      "filePath": "/Users/you/project/docs/product/REQUIREMENTS.md",
      "step": "requirements",
      "raw": "# Requirements\n\n## Functional requirements\n\n- **FR-01** — User có thể mở video local từ Files hoặc iCloud.\n- **FR-02** — User có thể nạp subtitle #1 (.srt).\n- **FR-03** — Hai subtitle hiển thị đồng thời, không chồng nhau.\n- **FR-05** — Ghi nhớ offset đã chỉnh cho lần mở sau.\n\n## Non-functional requirements\n\n- **NFR-PERF-01** — Seek dưới 200ms trên file 2GB.\n\n## Ghi chú của bạn\n\nƯu tiên iOS trước, Android tính sau khi có 100 user thật.\n",
      "updatedAt": "2026-09-01T16:00:42.538Z",
      "lastRunId": "run-001",
      "sections": [
        {
          "key": "functional",
          "heading": "Functional requirements",
          "kind": "items",
          "idPrefix": "FR",
          "hint": "One checkable behaviour per line.",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "FR-01",
              "text": "User có thể mở video local từ Files hoặc iCloud.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            },
            {
              "id": "FR-02",
              "text": "User có thể nạp subtitle #1 (.srt).",
              "origin": "ai",
              "pinned": true,
              "flagged": false
            },
            {
              "id": "FR-03",
              "text": "Hai subtitle hiển thị đồng thời, không chồng nhau.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            },
            {
              "id": "FR-05",
              "text": "Ghi nhớ offset đã chỉnh cho lần mở sau.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "nonFunctional",
          "heading": "Non-functional requirements",
          "kind": "items",
          "idPrefix": "NFR",
          "grouped": true,
          "hint": "Group by category: NFR-PERF-01, NFR-A11Y-01, …",
          "prose": "",
          "stray": 0,
          "items": [
            {
              "id": "NFR-PERF-01",
              "text": "Seek dưới 200ms trên file 2GB.",
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ],
          "records": []
        },
        {
          "key": "unknown:ghi-ch-c-a-b-n",
          "heading": "Ghi chú của bạn",
          "kind": "unknown",
          "prose": "Ưu tiên iOS trước, Android tính sau khi có 100 user thật.",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "product/FEATURES.md",
      "title": "Feature breakdown",
      "exists": false,
      "filePath": "/Users/you/project/docs/product/FEATURES.md",
      "step": "features",
      "raw": "# Feature breakdown\n\n## Feature tree\n\n## Features\n",
      "sections": [
        {
          "key": "tree",
          "heading": "Feature tree",
          "kind": "prose",
          "shape": "ascii-tree",
          "hint": "A fenced ```text ASCII tree. Kept verbatim.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "features",
          "heading": "Features",
          "kind": "items",
          "idPrefix": "F",
          "grouped": true,
          "hint": "Group in the id: F-VIDEO-01. Cite the FR ids the feature covers.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "product/USE_CASES.md",
      "title": "Use cases",
      "exists": true,
      "filePath": "/Users/you/project/docs/product/USE_CASES.md",
      "step": "usecases",
      "raw": "# Use cases\n\n## Use cases\n\n### UC-01 — Open video\n\n- **Actor:** Người học\n- **Trigger:** Bấm \"Mở video\" — FR-01\n- **Main flow:**\n  - Chọn file từ Files\n  - Player nạp và hiển thị khung đầu\n",
      "updatedAt": "2026-09-01T16:00:42.521Z",
      "sections": [
        {
          "key": "useCases",
          "heading": "Use cases",
          "kind": "records",
          "idPrefix": "UC",
          "fields": [
            {
              "label": "Actor",
              "required": true
            },
            {
              "label": "Trigger",
              "required": true
            },
            {
              "label": "Preconditions",
              "list": true
            },
            {
              "label": "Main flow",
              "list": true,
              "required": true
            },
            {
              "label": "Alternate flows",
              "list": true
            },
            {
              "label": "Postconditions",
              "list": true
            }
          ],
          "prose": "",
          "stray": 0,
          "items": [],
          "records": [
            {
              "id": "UC-01",
              "title": "Open video",
              "fields": [
                {
                  "label": "Actor",
                  "value": "Người học",
                  "items": []
                },
                {
                  "label": "Trigger",
                  "value": "Bấm \"Mở video\" — FR-01",
                  "items": []
                },
                {
                  "label": "Main flow",
                  "value": "",
                  "items": [
                    "Chọn file từ Files",
                    "Player nạp và hiển thị khung đầu"
                  ]
                }
              ],
              "origin": "human",
              "pinned": false,
              "flagged": false
            }
          ]
        }
      ]
    },
    {
      "path": "product/USER_FLOWS.md",
      "title": "User flow / Screen flow",
      "exists": false,
      "filePath": "/Users/you/project/docs/product/USER_FLOWS.md",
      "step": "userflows",
      "raw": "# User flow / Screen flow\n\n## Screen flow\n\n## Screens\n\n## Flows\n",
      "sections": [
        {
          "key": "screenFlow",
          "heading": "Screen flow",
          "kind": "prose",
          "shape": "mermaid-flowchart",
          "hint": "A fenced ```mermaid flowchart TD. Each node is a screen. Kept verbatim.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "screens",
          "heading": "Screens",
          "kind": "items",
          "idPrefix": "SCR",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "flows",
          "heading": "Flows",
          "kind": "records",
          "idPrefix": "FLOW",
          "hint": "A mermaid block under a flow is kept verbatim.",
          "fields": [
            {
              "label": "Use cases",
              "required": true
            },
            {
              "label": "Steps",
              "list": true,
              "required": true
            }
          ],
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/DATA_MODEL.md",
      "title": "Data / API / Storage",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/DATA_MODEL.md",
      "step": "datamodel",
      "raw": "# Data / API / Storage\n\n## Overview\n\n## Entities\n\n## Repositories\n\n## API endpoints\n\n## Storage\n",
      "sections": [
        {
          "key": "overview",
          "heading": "Overview",
          "kind": "prose",
          "shape": "ascii-tree",
          "hint": "A fenced ```text tree of the data layer. Areas, not fields or every endpoint.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "entities",
          "heading": "Entities",
          "kind": "items",
          "idPrefix": "E",
          "hint": "One line per concept or area. Do not list fields.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "repositories",
          "heading": "Repositories",
          "kind": "items",
          "idPrefix": "REPO",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "api",
          "heading": "API endpoints",
          "kind": "items",
          "idPrefix": "API",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "storage",
          "heading": "Storage",
          "kind": "prose",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/ARCHITECTURE.md",
      "title": "Architecture",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/ARCHITECTURE.md",
      "step": "architecture",
      "raw": "# Architecture\n\n## Layering\n\n## Layers\n\n## Patterns\n\n## Rationale\n",
      "sections": [
        {
          "key": "layering",
          "heading": "Layering",
          "kind": "prose",
          "shape": "ascii-tree",
          "hint": "A fenced ```text ASCII stack. Kept verbatim.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "layers",
          "heading": "Layers",
          "kind": "items",
          "idPrefix": "L",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "patterns",
          "heading": "Patterns",
          "kind": "items",
          "idPrefix": "PAT",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "rationale",
          "heading": "Rationale",
          "kind": "prose",
          "hint": "Why this shape fits these use cases.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/MODULES.md",
      "title": "Modules",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/MODULES.md",
      "step": "architecture",
      "raw": "# Modules\n\n## Modules\n",
      "sections": [
        {
          "key": "modules",
          "heading": "Modules",
          "kind": "records",
          "idPrefix": "M",
          "fields": [
            {
              "label": "Responsibility",
              "required": true
            },
            {
              "label": "Depends on",
              "list": true
            },
            {
              "label": "Folder"
            }
          ],
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/DATA_FLOW.md",
      "title": "Data flow",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/DATA_FLOW.md",
      "step": "architecture",
      "raw": "# Data flow\n\n## Data flow\n",
      "sections": [
        {
          "key": "dataFlow",
          "heading": "Data flow",
          "kind": "prose",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/TECH_STACK.md",
      "title": "Technical decisions",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/TECH_STACK.md",
      "step": "techdecisions",
      "raw": "# Technical decisions\n\n## Stack\n\n## Open questions\n",
      "sections": [
        {
          "key": "stack",
          "heading": "Stack",
          "kind": "records",
          "idPrefix": "TECH",
          "fields": [
            {
              "label": "Choice",
              "required": true
            },
            {
              "label": "Why",
              "required": true
            },
            {
              "label": "Alternatives considered",
              "list": true
            }
          ],
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "openQuestions",
          "heading": "Open questions",
          "kind": "items",
          "idPrefix": "TQ",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "architecture/PROJECT_STRUCTURE.md",
      "title": "Project structure",
      "exists": false,
      "filePath": "/Users/you/project/docs/architecture/PROJECT_STRUCTURE.md",
      "step": "structure",
      "raw": "# Project structure\n\n## Folder tree\n\n## Naming conventions\n\n## Module mapping\n",
      "sections": [
        {
          "key": "tree",
          "heading": "Folder tree",
          "kind": "prose",
          "hint": "A fenced block. Kept verbatim.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "naming",
          "heading": "Naming conventions",
          "kind": "items",
          "idPrefix": "NC",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "mapping",
          "heading": "Module mapping",
          "kind": "items",
          "idPrefix": "MAP",
          "hint": "One line per module: cite its M-id and the folder it owns.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    },
    {
      "path": "plans/IMPLEMENTATION_PLAN.md",
      "title": "Implementation plan",
      "exists": true,
      "filePath": "/Users/you/project/docs/plans/IMPLEMENTATION_PLAN.md",
      "step": "plan",
      "raw": "# Implementation plan\n\n## Phases\n\n### PH-01 — Project skeleton\n\n- **Goal:** Dựng khung project, DI container và navigation.\n- **Deliverables:**\n  - Cây thư mục theo PROJECT_STRUCTURE.md\n  - DI container rỗng\n- **Definition of done:**\n  - App build được và chạy màn hình trắng\n\n### PH-02 — Video playback\n\n- **Goal:** Mở và phát video local.\n- **Depends on:**\n  - PH-01\n- **Deliverables:**\n  - Player hiển thị video — FR-01\n\n### PH-03 — Dual subtitle\n\n- **Goal:** Hiển thị hai subtitle cùng lúc, chỉnh offset riêng.\n- **Depends on:**\n  - PH-02\n- **Deliverables:**\n  - Hai track subtitle — FR-03\n  - Offset control — FR-05\n",
      "updatedAt": "2026-09-01T16:00:42.545Z",
      "sections": [
        {
          "key": "phases",
          "heading": "Phases",
          "kind": "records",
          "idPrefix": "PH",
          "fields": [
            {
              "label": "Goal",
              "required": true
            },
            {
              "label": "Depends on",
              "list": true
            },
            {
              "label": "Deliverables",
              "list": true,
              "required": true
            },
            {
              "label": "Definition of done",
              "list": true
            }
          ],
          "prose": "",
          "stray": 0,
          "items": [],
          "records": [
            {
              "id": "PH-01",
              "title": "Project skeleton",
              "fields": [
                {
                  "label": "Goal",
                  "value": "Dựng khung project, DI container và navigation.",
                  "items": []
                },
                {
                  "label": "Deliverables",
                  "value": "",
                  "items": [
                    "Cây thư mục theo PROJECT_STRUCTURE.md",
                    "DI container rỗng"
                  ]
                },
                {
                  "label": "Definition of done",
                  "value": "",
                  "items": [
                    "App build được và chạy màn hình trắng"
                  ]
                }
              ],
              "origin": "ai",
              "pinned": false,
              "flagged": false
            },
            {
              "id": "PH-02",
              "title": "Video playback",
              "fields": [
                {
                  "label": "Goal",
                  "value": "Mở và phát video local.",
                  "items": []
                },
                {
                  "label": "Depends on",
                  "value": "",
                  "items": [
                    "PH-01"
                  ]
                },
                {
                  "label": "Deliverables",
                  "value": "",
                  "items": [
                    "Player hiển thị video — FR-01"
                  ]
                }
              ],
              "origin": "ai",
              "pinned": false,
              "flagged": false
            },
            {
              "id": "PH-03",
              "title": "Dual subtitle",
              "fields": [
                {
                  "label": "Goal",
                  "value": "Hiển thị hai subtitle cùng lúc, chỉnh offset riêng.",
                  "items": []
                },
                {
                  "label": "Depends on",
                  "value": "",
                  "items": [
                    "PH-02"
                  ]
                },
                {
                  "label": "Deliverables",
                  "value": "",
                  "items": [
                    "Hai track subtitle — FR-03",
                    "Offset control — FR-05"
                  ]
                }
              ],
              "origin": "ai",
              "pinned": false,
              "flagged": false
            }
          ]
        }
      ]
    },
    {
      "path": "plans/SKELETON.md",
      "title": "Generate skeleton",
      "exists": false,
      "filePath": "/Users/you/project/docs/plans/SKELETON.md",
      "step": "skeleton",
      "raw": "# Generate skeleton\n\n## Skeleton tree\n\n## Files and folders\n\n## Interfaces\n\n## Config\n\n## Tests\n",
      "sections": [
        {
          "key": "tree",
          "heading": "Skeleton tree",
          "kind": "prose",
          "shape": "ascii-tree",
          "hint": "A fenced ```text ASCII tree. Kept verbatim.",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "files",
          "heading": "Files and folders",
          "kind": "items",
          "idPrefix": "SK",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "interfaces",
          "heading": "Interfaces",
          "kind": "items",
          "idPrefix": "IF",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "config",
          "heading": "Config",
          "kind": "items",
          "idPrefix": "CFG",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        },
        {
          "key": "tests",
          "heading": "Tests",
          "kind": "items",
          "idPrefix": "TST",
          "prose": "",
          "stray": 0,
          "items": [],
          "records": []
        }
      ]
    }
  ],
  "devDocs": [
    {
      "path": "development/CODING_RULES.md",
      "filePath": "/Users/you/project/docs/development/CODING_RULES.md",
      "exists": false
    },
    {
      "path": "development/TESTING_RULES.md",
      "filePath": "/Users/you/project/docs/development/TESTING_RULES.md",
      "exists": false
    },
    {
      "path": "development/GIT_WORKFLOW.md",
      "filePath": "/Users/you/project/docs/development/GIT_WORKFLOW.md",
      "exists": false
    }
  ],
  "extraFiles": {
    "architecture/ADR": []
  },
  "issues": [
    {
      "level": "warn",
      "code": "not-covered",
      "file": "product/FEATURES.md",
      "id": "FR-01",
      "message": "FR-01 is not covered in product/FEATURES.md."
    },
    {
      "level": "warn",
      "code": "not-covered",
      "file": "product/FEATURES.md",
      "id": "FR-02",
      "message": "FR-02 is not covered in product/FEATURES.md."
    },
    {
      "level": "warn",
      "code": "not-covered",
      "file": "product/FEATURES.md",
      "id": "FR-03",
      "message": "FR-03 is not covered in product/FEATURES.md."
    },
    {
      "level": "warn",
      "code": "not-covered",
      "file": "product/FEATURES.md",
      "id": "FR-05",
      "message": "FR-05 is not covered in product/FEATURES.md."
    },
    {
      "level": "warn",
      "code": "not-covered",
      "file": "product/USER_FLOWS.md",
      "id": "UC-01",
      "message": "UC-01 is not covered in product/USER_FLOWS.md."
    },
    {
      "level": "warn",
      "code": "stale-doc",
      "file": "product/USE_CASES.md",
      "message": "product/REQUIREMENTS.md changed after product/USE_CASES.md was written — re-check it."
    }
  ],
  "runs": [
    {
      "id": "run-001",
      "step": "requirements",
      "mode": "refine",
      "startedAt": "2026-09-01T16:00:42.535Z",
      "finishedAt": "2026-09-01T16:00:42.541Z",
      "note": "thêm phần dual subtitle",
      "diff": {
        "added": [
          "product/REQUIREMENTS.md#FR-05",
          "product/REQUIREMENTS.md#NFR-PERF-01"
        ],
        "updated": [
          "product/REQUIREMENTS.md#FR-01"
        ],
        "removed": [
          "product/REQUIREMENTS.md#FR-04"
        ]
      },
      "guardrail": [],
      "status": "review",
      "revertable": true
    }
  ],
  "phases": [
    {
      "id": "PH-01",
      "title": "Project skeleton",
      "goal": "Dựng khung project, DI container và navigation.",
      "dependsOn": [],
      "deliverables": [
        "Cây thư mục theo PROJECT_STRUCTURE.md",
        "DI container rỗng"
      ],
      "definitionOfDone": [
        "App build được và chạy màn hình trắng"
      ],
      "cites": [],
      "suggestedRecipe": "cofofo-bootstrap",
      "handoff": {
        "phaseId": "PH-01",
        "epicId": "EPIC-004",
        "recipeId": "cofofo-bootstrap",
        "title": "PH-01 — Project skeleton",
        "at": "2026-09-01T16:00:42.548Z"
      }
    },
    {
      "id": "PH-02",
      "title": "Video playback",
      "goal": "Mở và phát video local.",
      "dependsOn": [
        "PH-01"
      ],
      "deliverables": [
        "Player hiển thị video — FR-01"
      ],
      "definitionOfDone": [],
      "cites": [
        {
          "id": "FR-01",
          "file": "product/REQUIREMENTS.md",
          "text": "User có thể mở video local từ Files hoặc iCloud."
        }
      ],
      "suggestedRecipe": "cofofo-feature"
    },
    {
      "id": "PH-03",
      "title": "Dual subtitle",
      "goal": "Hiển thị hai subtitle cùng lúc, chỉnh offset riêng.",
      "dependsOn": [
        "PH-02"
      ],
      "deliverables": [
        "Hai track subtitle — FR-03",
        "Offset control — FR-05"
      ],
      "definitionOfDone": [],
      "cites": [
        {
          "id": "FR-03",
          "file": "product/REQUIREMENTS.md",
          "text": "Hai subtitle hiển thị đồng thời, không chồng nhau."
        },
        {
          "id": "FR-05",
          "file": "product/REQUIREMENTS.md",
          "text": "Ghi nhớ offset đã chỉnh cho lần mở sau."
        }
      ],
      "suggestedRecipe": "cofofo-feature"
    }
  ],
  "activeRun": {
    "run": {
      "id": "run-001",
      "step": "requirements",
      "mode": "refine",
      "startedAt": "2026-09-01T16:00:42.535Z",
      "finishedAt": "2026-09-01T16:00:42.541Z",
      "note": "thêm phần dual subtitle",
      "diff": {
        "added": [
          "product/REQUIREMENTS.md#FR-05",
          "product/REQUIREMENTS.md#NFR-PERF-01"
        ],
        "updated": [
          "product/REQUIREMENTS.md#FR-01"
        ],
        "removed": [
          "product/REQUIREMENTS.md#FR-04"
        ]
      },
      "guardrail": [],
      "status": "review",
      "revertable": true
    },
    "added": [
      {
        "key": "product/REQUIREMENTS.md#FR-05",
        "file": "product/REQUIREMENTS.md",
        "id": "FR-05",
        "text": "Ghi nhớ offset đã chỉnh cho lần mở sau."
      },
      {
        "key": "product/REQUIREMENTS.md#NFR-PERF-01",
        "file": "product/REQUIREMENTS.md",
        "id": "NFR-PERF-01",
        "text": "Seek dưới 200ms trên file 2GB."
      }
    ],
    "updated": [
      {
        "key": "product/REQUIREMENTS.md#FR-01",
        "file": "product/REQUIREMENTS.md",
        "id": "FR-01",
        "text": "User có thể mở video local từ Files hoặc iCloud.",
        "before": "User có thể mở video local từ Files."
      }
    ],
    "removed": [
      {
        "key": "product/REQUIREMENTS.md#FR-04",
        "file": "product/REQUIREMENTS.md",
        "id": "FR-04",
        "text": "Mỗi subtitle chỉnh được offset riêng — FR-42 sẽ bổ sung sau."
      }
    ]
  }
};
