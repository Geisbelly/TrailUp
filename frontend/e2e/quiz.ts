import { expect, type Page } from '@playwright/test';
export async function responderQuiz(page: Page) {
  await page.getByLabel('Data de nascimento').fill('2000-01-01');
  await page.getByLabel('Nome completo').fill('Aluno Teste');
  await page.getByLabel('Apelido').fill('Aluno');
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByText('Misto', {exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByText('Pensante', {exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  for (let i=0;i<7;i++) {
    for (const button of await page.getByRole('button', {name:'3', exact:true}).all()) await button.click();
    await page.getByRole('button', {name: i<6 ? 'Próximo' : /Finalizar/, exact:i<6}).click();
  }
  await expect(page.getByRole('button', {name:'Concluir', exact:true})).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name:'Concluir', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Suas preferências iniciais'})).toBeVisible();
}

