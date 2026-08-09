# AIDLC User Workflow

Tài liệu này mô tả workflow user-facing của AIDLC cho các trường hợp:

- Project mới hoặc đã tồn tại.
- Project chưa hoặc đã được khởi tạo AIDLC.
- Epic mới, resume Epic hiện có hoặc explicit overwrite/reset.
- Manual execution và automatic execution.
- Manual review và automatic review.
- Approval gate, recovery, pause và resume.
- Commit artifact và external communication.

Execution mode và review mode là hai lựa chọn độc lập. Ví dụ, một Epic có thể chạy Build ở chế độ `auto` nhưng vẫn dùng manual review.

## 1. Project onboarding và Epic entry

```mermaid
flowchart TD
    START(["User mở AIDLC"]) --> FOLDER{"Project folder đã tồn tại?"}

    FOLDER -- "Chưa" --> IDEA["Nhập product idea, platform và constraints"]
    IDEA --> PROPOSE_NEW["Đề xuất stack, model, agent, skills và workflow"]
    PROPOSE_NEW --> CONFIRM_NEW{"User xác nhận?"}
    CONFIRM_NEW -- "Chỉnh sửa" --> IDEA
    CONFIRM_NEW -- "Đồng ý" --> CREATE_PROJECT["Tạo project/repository và cấu trúc chuẩn"]

    FOLDER -- "Đã tồn tại" --> INITIALIZED{".aidlc đã tồn tại?"}
    INITIALIZED -- "Chưa" --> SCAN["Phân tích project read-only"]
    SCAN --> RECOMMEND["Đề xuất profile, model, agent, skills và validators"]
    RECOMMEND --> CONFIRM_REC{"Accept hoặc override?"}
    CONFIRM_REC -- "Override" --> RECOMMEND
    CONFIRM_REC -- "Accept" --> INIT["Khởi tạo .aidlc<br/>Default autonomy = guide"]

    CREATE_PROJECT --> CONTEXT
    INIT --> CONTEXT
    INITIALIZED -- "Đã có" --> LOAD["Load config, Project Context và durable state"]
    LOAD --> LEGACY{"Có legacy DeliveryState?"}

    LEGACY -- "Có" --> MIGRATE_PREVIEW["Preview migration<br/>Không mutation"]
    MIGRATE_PREVIEW --> MIGRATE_APPROVAL{"User approve migration?"}
    MIGRATE_APPROVAL -- "Không" --> COMPAT["Compatibility mode<br/>Giữ nguyên state cũ"]
    MIGRATE_APPROVAL -- "Có" --> MIGRATE["Migrate sang unified Epic state"]
    LEGACY -- "Không" --> CONTEXT
    COMPAT --> CONTEXT
    MIGRATE --> CONTEXT

    CONTEXT{"Explicit Project Context refresh?"}
    CONTEXT -- "Không" --> KEEP_CONTEXT["Dùng context revision hiện tại"]
    CONTEXT -- "Có" --> REFRESH["Phân tích lại và tạo context revision mới"]

    KEEP_CONTEXT --> EPIC
    REFRESH --> EPIC

    EPIC{"Epic đã tồn tại?"}
    EPIC -- "Chưa" --> CREATE_EPIC["Tạo Epic draft"]
    EPIC -- "Đã có" --> EXISTING_ACTION{"User muốn làm gì?"}

    EXISTING_ACTION -- "Resume mặc định" --> RESUME["Load đúng state, event và next action"]
    EXISTING_ACTION -- "Overwrite/reset explicit" --> RESET_PREVIEW["Preview state sẽ bị thay thế"]
    RESET_PREVIEW --> RESET_APPROVAL{"User approve overwrite?"}
    RESET_APPROVAL -- "Không" --> RESUME
    RESET_APPROVAL -- "Có" --> RESET["Reset Epic theo explicit command"]
    EXISTING_ACTION -- "Epic khác" --> CREATE_EPIC

    CREATE_EPIC --> LOCK["Accept/override recommendation<br/>Lock model, agent, skills và profile"]
    RESET --> LOCK
    RESUME --> READY
    LOCK --> POLICY["Chọn execution mode và review mode<br/>Có thể override theo stage"]
    POLICY --> READY["Compile adaptive workflow"]

    READY --> PROFILE{"Workflow profile"}
    PROFILE -- "Quick" --> QUICK["Understand → Build → Verify<br/>Ship optional"]
    PROFILE -- "Standard" --> STANDARD["Understand → Plan → Build → Verify → Ship"]
    PROFILE -- "Parallel" --> PARALLEL["Understand → Plan → Build subruns<br/>→ Integrate/Verify → Ship"]
    PROFILE -- "Regulated" --> REGULATED["5 stages + evidence, traceability<br/>và mandatory gates"]

    QUICK --> RUN(["Bắt đầu hoặc tiếp tục Epic Run"])
    STANDARD --> RUN
    PARALLEL --> RUN
    REGULATED --> RUN
```

## 2. Execution, review, approval và recovery

```mermaid
flowchart TD
    RUN(["Stage/action tiếp theo"]) --> MODE{"Execution mode"}

    subgraph MANUAL["Manual execution"]
        GUIDE["Guide<br/>Explain + preview<br/>User tự thực hiện mutation"]
        ASSIST["Assist<br/>AI tạo plan/diff/command<br/>User xác nhận trước mutation"]
    end

    subgraph AUTOMATIC["Automatic execution"]
        AUTO["Auto<br/>Tự chạy stage, retry và validate<br/>Dừng tại configured gate"]
        UNATTENDED["Unattended<br/>Tự chạy end-to-end<br/>Dừng tại hard gate hoặc blocker"]
    end

    MODE -- "guide" --> GUIDE
    MODE -- "assist" --> ASSIST
    MODE -- "auto" --> AUTO
    MODE -- "unattended" --> UNATTENDED

    GUIDE --> USER_EXEC["User chạy action<br/>và cung cấp evidence"]
    ASSIST --> MUTATION_APPROVAL{"Approve mutation?"}
    MUTATION_APPROVAL -- "Không" --> WAITING
    MUTATION_APPROVAL -- "Có" --> GATE_CHECK
    AUTO --> GATE_CHECK
    UNATTENDED --> GATE_CHECK

    GATE_CHECK{"Action có gate?"}
    GATE_CHECK -- "Không" --> EXECUTE["Claude CLI thực thi action"]
    GATE_CHECK -- "Dependency/risk gate" --> POLICY_GATE{"Policy yêu cầu approval?"}
    POLICY_GATE -- "Không" --> EXECUTE
    POLICY_GATE -- "Có" --> PREVIEW
    GATE_CHECK -- "Destructive change" --> PREVIEW
    GATE_CHECK -- "Merge default branch" --> PREVIEW
    GATE_CHECK -- "External communication" --> PREVIEW

    PREVIEW["Preview destination, content<br/>mutation scope và side effects"] --> HUMAN_GATE{"Human approval"}
    HUMAN_GATE -- "Approve" --> EXECUTE
    HUMAN_GATE -- "Yêu cầu chỉnh sửa" --> REPLAN["Chỉnh plan/scope/content"]
    HUMAN_GATE -- "Reject hoặc pause" --> WAITING["waiting-for-user / paused"]
    REPLAN --> RUN
    WAITING --> RESUME{"Resume?"}
    RESUME -- "Có" --> RUN
    RESUME -- "Chưa" --> STOP(["Giữ durable state"])

    USER_EXEC --> VALIDATE
    EXECUTE --> EXEC_RESULT{"Execution thành công?"}
    EXEC_RESULT -- "Không" --> RETRY{"Còn recovery attempt?"}
    RETRY -- "Có" --> RECOVER["Diagnose, repair và retry"]
    RECOVER --> EXECUTE
    RETRY -- "Không" --> BLOCKED["blocked<br/>Kèm lỗi, evidence và recovery guide"]
    BLOCKED --> RESUME
    EXEC_RESULT -- "Có" --> VALIDATE["Chạy tests, validators<br/>và thu thập evidence"]

    VALIDATE --> VALID{"Validation pass?"}
    VALID -- "Không" --> RETRY
    VALID -- "Có" --> REVIEW_MODE{"Review mode"}

    REVIEW_MODE -- "Manual review" --> HUMAN_REVIEW["User xem diff, artifacts,<br/>tests và annotations"]
    REVIEW_MODE -- "Auto review" --> AI_REVIEW["Independent review agent<br/>+ AST graph + validators"]

    AI_REVIEW --> AI_RESULT{"Auto review pass?"}
    AI_RESULT -- "Không, có thể sửa" --> RECOVER
    AI_RESULT -- "Ambiguous/high risk" --> HUMAN_REVIEW
    AI_RESULT -- "Có" --> SIGNOFF{"Policy cần human sign-off?"}

    SIGNOFF -- "Có" --> HUMAN_REVIEW
    SIGNOFF -- "Không" --> STAGE_DONE

    HUMAN_REVIEW --> REVIEW_DECISION{"Review decision"}
    REVIEW_DECISION -- "Approve" --> STAGE_DONE["Stage approved"]
    REVIEW_DECISION -- "Request changes" --> REPLAN
    REVIEW_DECISION -- "Reject/pause" --> WAITING

    STAGE_DONE --> MORE{"Còn stage?"}
    MORE -- "Có" --> RUN
    MORE -- "Không, đến Ship" --> ARTIFACTS["ArtifactPolicy chọn artifact được phép commit"]
    ARTIFACTS --> COMMIT_PREVIEW["Preview chính xác staged artifacts"]
    COMMIT_PREVIEW --> COMMIT["Commit theo policy"]

    COMMIT --> EXTERNAL{"Có PR, publish, comment<br/>release hoặc merge?"}
    EXTERNAL -- "Không" --> COMPLETE
    EXTERNAL -- "Có" --> EXT_APPROVAL{"Human approval bắt buộc<br/>kể cả unattended"}
    EXT_APPROVAL -- "Reject/edit" --> WAITING
    EXT_APPROVAL -- "Approve" --> COMMUNICATE["Thực hiện external communication"]
    COMMUNICATE --> COMPLETE["completed<br/>State + event log + audit + evidence"]
```

## 3. Quy tắc bắt buộc

1. Project mới mặc định dùng `guide`.
2. Project Context chỉ refresh bằng explicit command.
3. Start một Epic đã tồn tại phải resume state hiện tại, không tạo state trùng.
4. Overwrite/reset Epic chỉ xảy ra qua explicit command có preview và approval.
5. Manual và automatic execution dùng chung engine, Epic state và event log.
6. Execution mode và review mode có thể cấu hình độc lập cho từng stage.
7. Auto review không được thay thế human approval tại hard gate.
8. Destructive change, merge default branch và external communication phải dừng tại hard gate.
9. External communication luôn cần human approval, kể cả `unattended`.
10. Chỉ artifact được `ArtifactPolicy` chọn mới xuất hiện trong commit preview.
11. Mọi failure phải tạo evidence, recovery action và durable state để có thể resume.
