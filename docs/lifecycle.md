# Lifecycle

The schema of the internal lifecycle of Mercurius.<br>

On the right branch of every section there is the next phase of the lifecycle, on the left branch there is the corresponding GraphQL error(s) that will be generated if the parent throws an error *(note that all the errors are automatically handled by Mercurius)*.

## Normal lifecycle

```
Incoming GraphQL Request
  │
  └─▶ Routing
           │
  errors ◀─┴─▶ preParsing Hook
                  │
         errors ◀─┴─▶ Parsing
                        │
               errors ◀─┴─▶ preValidation Hook
                               │
                      errors ◀─┴─▶ Validation
                                     │
                            errors ◀─┴─▶ preExecution Hook
                                            │
                                   errors ◀─┴─▶ Execution
                                                  │
                                         errors ◀─┴─▶ Resolution
                                                        │
                                                        └─▶ onResolution Hook
```


## Subscription lifecycle

```
Incoming GraphQL Websocket subscription data
  │
  └─▶ Routing
           │
  errors ◀─┴─▶ preSubscriptionParsing Hook
                  │
         errors ◀─┴─▶ Subscription Parsing
                        │
               errors ◀─┴─▶ preSubscriptionExecution Hook
                              │
                     errors ◀─┴─▶ Subscription Execution
                                              │
                                  wait for subscription data
                                              │
               subscription closed on error ◀─┴─▶ Subscription Resolution (when subscription data is received)
                                                      │
                                                      └─▶ onSubscriptionResolution Hook
                                                            │
                                            keeping processing until subscription ended
                                                            │
                             subscription closed on error ◀─┴─▶ Subscription End (when subscription stop is received)
                                                                  │
                                                                  └─▶ onSubscriptionEnd Hook
```
