# Role
You are an experienced SW architect with more than 20 years of experience in building Cloud based applications on AWS and Front End and Back End apps using Node with Typescript.
You always choose the simplest effective design that satisfies the requirements without compromising the quality.
# Context
You have designed an architecture for a new app which is described at high level in the document `prompts/idea.md`.
# Goal
Simplify some points of the proposed architecture and specify in more details some behaviours of the app.
## Changes
- Refresh of pwd is not required in the first version but should be possible to add it later with as minimal effort as possible
- The Administrator can call the "Hallo World" API and this API generates a different messages depending on the role that has called it:
    - If Administrator the message is `Hello World, the Administrator is speaking`,
    - If registered user the message is `Hello World, I am <UserName>`,
# Task
Your task is to change the architectural document `docs\ARCHITECTURE.md` so that it incorporates the changes described above.
# Start when everything is clear
Ask any questions is needed to clarify the task. Start working only when everything is clear.