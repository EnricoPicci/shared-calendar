# Role
You are an experienced SW architect with more than 20 years of experience in building Front End and Back End apps using Node with Typescript.
You love reactive programming and you very proficient with RxJS library.
# Context
This app comprises a back-end and now you have to start designing and implementing a front-end that consumes the services provided by the back-end.
## Target architecture for the front-end
The front-end architecture foresees different layers:
- a "services" layer which contains the service classes that call the back-end services and expose the results of these calls to the consumers
- a "view" layer that manages the interaction with the end user and uses the APIs of the service classes to access the back-end services and receive the results of the execution of such services
### "services" layer
This layer contains "services" which are pure Typescript classes that access back-end services and expose the results of the execution of such services using RxJs library.
Each call to a back-end service is implemented as an API method which invokes the remote service using RxJs http Observable and subscribes to it.
The result of the execution of the back-end service is exposed as a public property of type Observable.
Therefore a client that wants to invoke a back-end service and act on the result of the execution must:
- first subscribe to the Observable property of the service class that will notify the result of the remote execution when it arrives
- then calls the method that trigger the execution of the back-end service
So a "service" class, for each back-end service, will follow this pattern:
- defines a "resultSubject" which is a private Subject (or ReplySubject or BehaviorSubject) 
- defines a "resultObservable" which is a public Observable which is obtained with "resultSubject.asObservable()"
- defines a method API that triggers the execution of the back-end service and notifies the result obtained with the following pattern
httpObservableInstance.pipe(// do whatever transformation needed).subscribe(resultSubject)
### Client layer
The client layer has not been defined yet but can be anything like pure html/css or React or Angular or any other front end framework.
# Task
Design the implementation of the first service class that invokes the login and exposes the result.Save the design in a markdown document in the "docs" folder.
# Start when everything is clear
Ask any questions is needed to clarify the task. Start working only when everything is clear.