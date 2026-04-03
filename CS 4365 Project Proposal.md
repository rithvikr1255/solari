
Names: Rithvik Reddygari, Jeshal Patel

### Project Plan

#### A
Notetaking has remained a boring, passive activity for a while. New applications like Obsidian, Notion, and Roam Research have been introduced to power new ways to organize thoughts, such as markdown rendering, linking topics, and graph views, but they still demand the user to learn them. In particular, Markdown, while being one of the cleanest and most expressive ways to format your thoughts, has such a steep learning curve such that most users never go beyond a simple bullet point list or italics. To demonstrate Markdown's formatting, this proposal was written with Markdown capabilities in Obsidian. This burden of formatting, linking, and organizing is on the writer when the situation may not be favorable, like when typing quickly during lecture, jotting down quick thoughts from a meeting, or worse.

Autocorrect has tried to solve this, but truth be told, they fall short when in application. They are completely blind to overall context. The individual writer wants corrections in relation to the domain, intent, and technical vocabulary they're working on. I recall taking notes for my CS 3210: Design of Operating Systems class, and having countless occurrences where I typed "vaddr" and it got autocorrected to "valor". Similarly, a student attempting to type out an example will get stuck in a mess of square brackets, spaces, and ASCII characters to clean up later without the context and intent of what they were doing in that moment. These problems can be solved with a new, powerful tool: large language models. They are excellent at context-aware rewriting and code generation, as demonstrated by AI coding tools like Cursor, Claude Code, and more. An integration with intent / domain context and LaTeX code generation would make it a powerful tool for the average notetaker.

LLMs have been present for a while, but it has only been recently where API-accessible and strong open-source LLMs have developed and made it practical to layer LLM services into applications. Take Github Copilot's integration with the Github.com website to review pull requests, Supabase's ability to edit a production database by AI-generated SQL queries on the fly, and more. This proves that AI-layered applications can significantly improve performance. We propose to bring this productivity to students that aims to clean up and provide the text layer, not the learning layer. A note-taking application that understands the context you're working with, whether be the lecture notes on your screen, the broken markdown intent you're trying to add, or the technical vocabulary of your field.

Our application, Solari, aims to empower notetakers in this way. It's a markdown-powered note-taking application with a built-in, proactive AI assistant / agent that works unobtrusively, without needing human intervention. The assistant has three core Responsibilities:
1. Contextual Autocorrect
	- Autocorrect that understands what you're doing. Understands domain vocab and typing patterns rather than blindly adding words.
2. Natural Language Markdown Interface
	- Understand informal attempts to format information. A user typing "(checkbox)" or similar signals that they want that in Markdown. Do that for them.
3. Seamless On-The-Fly LaTeX generation
	- Take rough ASCII matrices or attempts to add math and render clean latex content instead. 
One of our stretch and interesting features to add would be a proactive knowledge graph. Take this example of Obsidian's knowledge graph, where nodes are individual note pages, and edges are self-inserted links to other nodes:
![[Screenshot 2026-02-19 at 8.42.38 PM.png]]
We want to attempt to have our assistant find these connections and automatically create them. Users of Obsidian really enjoy this feature, including myself, but I've always disliked how tedious it was to make this graph grow, requiring the user to manually add the link.


#### B
By the end of the semester, we want Solari to be able to have these features:
- Contextual Autocorrect
	- The assistant should be fixing genuine typos while preserving all technical references and content. For a metric, we've decided on a base target of 90% accuracy on a test set of 20 lecture-style rapid typing samples. We will try to attempt to get less than 5% false positives, where a false positive would be the assistant falsely correcting a correct word.
- Natural Language Interface for Markdown
	- The assistant can accurately detect and correct informal attempts to use special formatting (tables, checkboxes, lists) and converts the text to proper markdown inline and in real time. 
- Seamless On-The-Fly LaTeX generation
	- The user can type a rough attempt at math using ASCII characters, and the assistant converts it to clean, formatted LaTeX inline and in real time.
- Context Integration
	- We want to empower the user further by allowing them to provide their assistant context. The assistant should be able to ingest content, such as a PDF or PPTX lecture deck to inform its corrections with better accuracy.
- Stretch Goal : AI-Assisted Knowledge Graph
	- The system process users' notes, determines if there's a connection, and if so, adds to a visual demonstration of the user's knowledge graph.

| Week    | Ricky                                                               | Jeshal                                              |
| ------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Week 5  | Research LLM API options; finalize tech stack                       | Research existing note-taking frameworks            |
| Week 6  | Set up base editor with Markdown rendering and previews             | Set up backend and LLM API                          |
| Week 7  |                                                                     | Implement natural language → Markdown conversion    |
| Week 8  | Test and refine autocorrect on rapid typing samples; build test set | Test and refine Markdown NL interface               |
| Week 9  | Implement PDF / PPTX ingestion for lecture context                  | Integrate PDF context into autocorrect and Markdown |
| Week 10 | Implement LaTeX code generation based on lecture slides and context | Implement LaTeX rendering in-editor and UI/UX       |
| Week 11 | Integration tests; try everything together                          | Integration testing and bug fixes                   |
| Week 12 | Work on knowledge graph (basic AI / relationship backend)           | Work on frontend visualization for graph            |
| Week 13 | Connect graph backend to editor with auto-updates                   | Polish graph view                                   |
| Week 14 | Full integrated system testing and benchmarks                       | Full integrated system testing                      |
| Week 15 | Final polishes and demo                                             | Final polishes and demo                             |
### Current Progress Report
This is currently the project proposal, so not much technical work has been done except research, discussion, and planning out our project idea.

### Supporting Evidence
It's currently the project proposal so no code has been written. The Github repo has been initialized at https://github.com/rithvikr1255/solari

### Skill Learning Report

The key skills the team would develop would be:
- LLM Prompt Engineering
	- We have to construct system prompts on the fly by using the specific context of the surrounding sentence structure and lecture material. We're looking into https://www.promptingguide.ai/ for guidance.
- Text-Processing
	- We have to work on making a editor, and study how they handle keystream events and to make them low enough latency so that the assistant feels smooth. We're looking into CodeMirror's docs to help with this.
- LaTeX generation
	- We have to study LaTeX generation patterns and find a way to integrate knowledge within the LLM. We have experience with the language, but will look into LaTeX's documentation further.
- Markdown Parsing, Abstract Syntax Trees
	- Understanding how markdown processing trees work to inject proper markdown in our app. We need to look into remark and unified ecosystems in JavaScript.
- Backend Design
	- We have to design a lightweight backend system to hook our LLM to. We're both experienced with Express, but will look into other backend architectures if the constraints require it.
- Frontend Design
	- We will have to look into building a lightweight and smooth frontend, as well as possibly handling our graph view which would be our main frontend challenge. We're looking into Electron to create our application.
### Self Evaluation
- Scope: 110%
	- We put 110% as this project tackles a hard problem across handling context, having a smooth UX, and intricacies of computer applications and file writing. We have to work with real-time LLM inference, markdown ASTs, LaTeX rendering, and more. The impact is huge, as it's one of the most context-aware applications for students and would significantly decrease cognitive load while trying to learn.
- Match: 100%
	- We feel this is achievable over the timeline. It will be difficult at certain times and is certainly non-trivial, but it is possible with our timeline.
- Factual: 100%
	- Both group members are CS students. We both have software development experience and experience working with LLM APIs. Rithvik has experience with markdown editors, and both group members are very familiar with LaTeX through classes. The feasibility of this project is also supported by similar projects such as Copilot and Notion AI, and we believe this vision is possible.