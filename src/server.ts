import 'dotenv/config';

import { buildApp } from './app';


const PORT =
  Number(process.env.PORT || 3000);


async function start() {

  const app =
    buildApp();


  try {

    await app.listen({
      port: PORT,
      host: '0.0.0.0'
    });


    console.log(
      `Code AI API running on port ${PORT}`
    );

  }
  catch (error) {

    app.log.error(error);

    process.exit(1);

  }

}


start();