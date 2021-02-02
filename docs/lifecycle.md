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

## Gateway lifecycle

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
                                                  └─▶ preGatewayExecution Hook(s) (appends errors only)
                                                         │
                                                errors ◀─┴─▶ GatewayExecution(s)
                                                               │
                                                      errors ◀─┴─▶ Resolution (once all GatewayExecutions have finished)
                                                                     │
                                                                     └─▶ onResolution Hook
```