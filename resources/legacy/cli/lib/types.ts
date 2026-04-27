export type burnOptions = {
  path?: string | true;
  model?: string | true;
  dataPath?: string | true;
  dataInstance?: string | true;
  description: string | true;
};

export type setOptions = {
  path?: string | true | undefined;
  model?: string | true | undefined;
  set: true;
};

export type meltOptions = { branch: string | true };
