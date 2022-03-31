import express from 'express';
import uniqid from 'uniqid';
import {
  parseRequestBody,
  ParseError,
  parseErrorResponse,
  containSyntacticalErrors,
  unableToProcessProjectWithErrorsResponse,
  performVerification,
  logRequestConcluded,
} from './utils';
import { Project, Abstractor } from '../ontouml';
import fs from 'fs';

export default async function(request: express.Request, response: express.Response, _next: express.NextFunction) {
  try {
    logTransformationRequest(request);

    const { project, options } = parseRequestBody(request);
    let output = performVerification(project, options);

    if (containSyntacticalErrors(output)) {
      unableToProcessProjectWithErrorsResponse(request, response, output);
    } else {
      const statusCode = 200;
      output = performAbstraction(project, options);
      response.status(statusCode).json(output);
      const JSONoutput = JSON.stringify(output);
      fs.writeFile('E:/Work/PhD/json_result.json', JSONoutput, err => {
        if (err) {
          console.error(err);
          return;
        }
      });
      logRequestConcluded(statusCode);
    }
  } catch (error) {
    if (error instanceof ParseError) {
      parseErrorResponse(request, response, error);
    } else {
      unexpectedTransformationErrorResponse(request, response, error);
    }
  }
}

function performAbstraction(project: Project, options: any): any {
  const service = new Abstractor(project, options);
  return service.run();
}

function logTransformationRequest(request: express.Request): void {
  console.log(`------------------------------------`);
  console.log(`[${new Date().toISOString()}] - Processing abstraction request`);
  console.log(`\tIP: ${request.ip}`);
  console.log(`\tProject ID: ${request.body.project ? request.body.project.id : 'Unavailable'}`);
  console.log(`\tOptions: ${request.body.options}`);
}

function unexpectedTransformationErrorResponse(_request: express.Request, response: express.Response, error: any): void {
  const errorId = uniqid();
  const responseBody = {
    id: errorId,
    status: 500,
    message: 'Internal server error',
  };

  console.error(`${errorId} - An unexpected error occurred during abstraction`);
  console.error(error.stack);
  console.error(responseBody);
  console.log(`------------------------------------`);

  response.status(500).json(responseBody);
}
